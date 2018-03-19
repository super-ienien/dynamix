"use strict";
const Validation = require ('./validation');
const privates = require ('../privates');
const helpers = require ('../helpers');

let cache = require("./cache");
let util = require("util");
let debug = util.debuglog ('remote');

module.exports = exports = ExternalConnection;

class ExternalConnection {

	constructor(socket, root)
	{
		this.id = socket.id;
		this.root = root;
		this.map = root.__static.map;

		socket.on ('dx-update', this.onUpdate.bind (this));
		socket.on ('dx-execute', this.onExecute.bind (this));
		socket.on ('dx-create', this.onCreate.bind (this));
		socket.on ('dx-destroy', this.onDestroy.bind (this));
		socket.once ('disconnect', this.destroy.bind(this));

		this.socket = socket;
		this.user = socket.user;
		this.connected = true;
		this.instances = new Map();

		this.publicConnection = new Connection(this);

		this.sendInit()
	}

	sendInit ()
    {
        this.socket.emit ('dx-init', {
            user: this.link(this.user, DynamixRequest.parse(this, true))
        });
    }

	sendTime ()
    {
        this.socket.emit ('server-time', Date.now());
    }

    init (data)
	{
		data = typeof data === 'object' ? data:{};
		data.remoted.user = {type: this.user.__static.name, data: this.user.toObject(this.user)};
		data.serverTime = new Date();
		this.socket.emit ('remote-init', data);
	}

    disconnect ()
    {
        if (this.connected) this.socket.disconnect();
    }

    destroy ()
    {
        this.connected = false;
        this.unlinkAll();
        this.publicConnection.emit('disconnect', this.publicConnection);
        this.socket.removeAllListeners();
        this.publicConnection.removeAllListeners();
        delete this.socket.user;
    }

/*    createReceived (uid, type, data)
    {
        let ret = null;
        if (cache.isRegistered (type))
        {
            if (cache.getType(type).canCreate(this.user))
            {
                debug ('create received : "'+type+'" '+uid);
                data.__creator__ = this.user;
                let instance = cache.exists (type, data);

                if (!instance)
                {
                    try
                    {
                        ret = cache.get (type, data).initialize();
                    }
                    catch (error)
                    {
                        console.error (error.stack);
                        ret = {error: true, reason: "internal server error"};
                    }
                }
                else
                {
                    ret = {error: true, reason: 'already exists'};
                }
            }
            else
            {
                console.error ('Warning : create access type "'+type+'" is not allowed for user "'+this.user.name()+'"');
                ret= {error: true, reason: 'Create on "'+type+'" is not allowed'};
            }
        }
        else
        {
            console.error ('create received on unknow type "'+type+'"');
            ret = {error: true, reason: 'type "'+type+'" not found'};
        }

        if (uid === false) return;
        let self = this;
        if (ret instanceof Promise)
        {
            ret.then(function ()
            {
                self.emit ('remote-create-callback-'+uid, {fulfilled: true});
            })
            .catch (function (err)
            {
                console.error (err.stack);
                self.emit ('remote-create-callback-'+uid, {error: true, reason: "internal server error"});
            });
        }
        else
        {
            this.emit ('remote-create-callback-'+uid, ret);
        }
    }*/

    /**
     *
     * @param uid
     * @param data
     */
	onUpdate (uid, data)
	{
		if (!Array.isArray (data)) {
			data = [data];
		}

		let p = [];
		for (let i = 0, l = data.length; i<l; i++)
		{
			let instance;
			 if (cache.isRegistered (type) && (instance = cache.getByExternalId(data[i]._id)))
            {
				p.push (instance.update(data[i], this.user));
			} else p.push(Promise.reject(data[i]._id+" not found"));
		}

		if (uid === false) return;
		let self = this;
		Promise.all(p.map(promise => helpers.inspectPromise(promise)))
        .then((results) =>
        {
            for (let i = 0; i<results.length; i++)
            {
                const result = results[i];
                if (result.isFulfilled)
                {
                    if (result.value.isValid)
                    {
                        results[i] = {fulfilled: true, value: result.value};
                    }
                    else
                    {
                        results[i] = {reject: true, reason: result.value};
                    }
                }
                else if (result.reason instanceof Error)
                {
                    console.error (result.reason);
                    results[i] = {error: true, reason: "Internal server error"};
                }
                else
                {
                    results[i] = {error: true, reason: result.reason};
                }
            }

			self.emit ('remote-update-callback-'+uid, results.length === 1 ? results[0]:results);
		});
	}

    /**
     *
     * @param uid
     * @param id
     * @param method
     * @param args
     * @returns {void}
     */
    onExecute (uid, id, method, ...args)
    {
        let ret = {};
        let instance = cache.getByExternalId(id);

        if (!instance)
        {
            console.error ('execute received on type "'+type+'" but instance with id "'+id+'" not found');
            ret.error = 'instance with id"'+id+'" on "'+type+'" not found';
        }
        else
        {
            let prop = instance.__static.methodsMap[method];
            if (!prop)
            {
                console.error ('function "'+method+'()" on "'+type+'" not found');
                ret.error = 'function "'+method+'()" on "'+type+'" not found';
            }
            else if (!prop.checkUserAccess (this.user, 'w'))
            {
                console.warn ('Execution of method "'+method+'()" '+'on '+instance+' is not allowed for user "'+this.user.name+'"');
                ret.error = 'execution of "'+method+'()" on "'+instance+'" not allowed';
            }
            else
            {
                try
                {
                    instance[privates.externalCaller] = this.publicConnection;
                    ret = instance[method](...args);
                    instance[privates.externalCaller] = null;
                }
                catch (error)
                {
                    if (error instanceof Error) ret = error;
                    else ret.error = error;
                }
            }
        }

        if (uid === false)
        {
            if (ret instanceof Error)
            {
                console.error (ret);
            }
            return;
        }

        switch (typeof ret)
        {
            case 'object':
                if (ret instanceof Error)
                {
                    console.error (ret);
                    ret = {error: true, reason: "internal server error"};
                }
                else if (ret instanceof Promise)
                {
                    return ret.then(function(val)
                    {
                        ret = {fulfilled: true, value: val};
                    })
                    .catch (function (error)
                    {
                        if (error instanceof Error) ret = {error: true, reason: "internal server error"};
                        else ret = {rejected: true, reason: error};
                    })
                    .then (() =>
                    {
                        this.emit ('remote-execute-callback-'+uid, ret);
                    });
                }
                else if (ret === null)
                {
                    ret = {fulfilled: true, value: null};
                }
                else if (ret.error)
                {
                    ret = {error: true, reason: ret.error}
                }
                else if (ret.rejected)
                {
                    ret = {rejected: true, reason: ret.rejected}
                }
                else
                {
                    ret = {fulfilled: true, value: ret};
                }
                this.emit ('remote-execute-callback-'+uid, ret);
                break;
            default:
                this.emit ('remote-execute-callback-'+uid, {fulfilled: true, value: ret});
        }
    }

    onDestroy (uid, rootId, prop, instanceId)
    {
        let ret;
        if (cache.isRegistered (type))
        {
            debug ('destroy received : '+type);
            let instance = cache.exists (type, data);
            if (instance)
            {
                if (instance.isAllowed('__destroy__', 'x', this.user))
                {
                    ret = instance.destroy(this);
                }
                else
                {
                    console.error ('Warning : write access type "'+type+'" is not allowed for user "'+this.user.name()+'"');
                    ret= {error: true, reason: 'Write on "'+type+'" is not allowed'};
                }
            }
            else
            {
                ret = {error: 'instance not found'};
                debug ('instance not found');
            }

        }
        else
        {
            console.error ('destroye received on unknow type "'+type+'"');
            ret = {error: 'type "'+type+'" not found'};
        }

        if (uid === false) return;
        let self = this;
        if (ret instanceof Promise)
        {
            ret.then(function ()
            {
                self.emit ('remote-destroy-callback-'+uid, {fulfilled: true});
            })
            .catch (function (error)
            {
                if (error instanceof Error)
                {
                    console.error (error.stack);
                    self.emit ('remote-destroy-callback-'+uid, {error: true, reason: "internal server error"});
                }
                else
                {
                    self.emit ('remote-destroy-callback-'+uid, {error: true, reason: "internal server error"});
                }
            });
        }
        else
        {
            if (ret === true)
            {
                this.emit ('remote-destroy-callback-'+uid, {fulfilled: true});
            }
            else
            {
                if (ret instanceof Error)
                {
                    console.error (ret.stack);
                    this.emit ('remote-destroy-callback-'+uid, {error: true, reason: "internal server error"});
                }
                else
                {
                    this.emit ('remote-destroy-callback-'+uid, {reject: true});
                }
            }
        }
    }

    link (instance, request)
    {
        if (!instance) return null;
        let externalId = this.instance.toString();
        if (this.instances.has(externalId)) return externalId;
        let ret = {
            _id: externalId
        };
        instance[privates.ExternalConnections].add(this);
        this.instances.set(externalId, instance);

        const map = request.getMap(instance);

        for (let propName in map)
        {
            let prop = map[propName];
            if (prop.isRemoted)
            {
                if (prop.isArray)
                {
                    const collection = instance[privates.virtualStore][propName] || [];
                    const subRequest = request.subRequests[propName];
                    const rangeStart = subRequest.rangeStart >= 0 && subRequest.rangeStart < collection.length ? subRequest.rangeStart : 0;
                    const rangeEnd = subRequest.rangeEnd >= 0 && subRequest.rangeEnd < collection.length ? subRequest.rangeEnd:collection.length;
                    for (let i = rangeStart; i < rangeEnd; i++)
                    {
                        return this.link(collection[i], request.subRequests[propName]);
                    }
                }
                else
                {
                    return this.link(instance[privates.virtualStore][propName], request.subRequests[propName]);
                }
            }
            else
            {
                ret[propName] = val;
            }
        }

        return ret;
    }

    unlink (instance)
    {
        let externalId = this.instance.toString();
        if (!this.instances.has(externalId)) return false;
        instance[privates.ExternalConnections].remove(this);
        this.instances.remove(externalId);
        return true;
    }

    unlinkAll ()
    {
        for (let instance of this.instances)
        {
            instance[privates.ExternalConnections].remove(this);
        }
        this.instances.clear();
    }
}

function updateDynamix (dynamix, data, user)
{
    const result = {};
    if (!Validation.validate(dynamix, data, user, result)) return result;

    if (typeof user === 'undefined')
    {
        console.error ('Warning : update operation aborted - no user provided');
        return result;
    }

    const promises = [];
    for (let i in data)
    {
        let p = updateDynamix(dynamix, this.__map[i], data[i], user);
        if (p) promises.push(p);
    }

    return promises.length > 0 ? promises.all(promises).finally(() => result):result;
}

function updateDynamixField (dynamix, prop, value, user, socket)
{
	switch (prop.propType)
	{
		case 'property':
			prop.setter.call(dynamix, value, user);
			return prop.getter.call(dynamix);
		break;
		case 'remoted':
			if (!value || typeof value !== 'object')
			{
                prop.setter.call(dynamix, null, user, socket);
			}
			else
			{
				let type = typeof prop.type === 'function' ? prop.type:cache.getType(data[i].__type__);
				if (!type) continue;
				remotedPromises[prop.name] = type.getById (data[i]._id)
				.bind(
					{
						self: this
					,	prop: prop
					,	type: type
					,	data: data[i]
					})
				.then (function (instance)
				{
					if (this.prop.accessor) this.self['r_'+this.prop.name](instance, user, false);
					else this.self[this.prop.name] = this.self[this.prop.name];
					delete this.data._id;
					if (Object.keys(this.data).length > 0) return instance.update (this.data, user);
					return instance;
				});
			}
			break;
		case 'mapped-object':
			if (prop.array)
			{
				if (util.isArray(data[i]))
				{
					var arr = [];
					for (var j = 0, l = data[i].length; j<l; j++)
					{
						arr[j] = {};
						_updateMappedObject (data[i][j], arr[j], this.__map[i].map);
					}
					if (prop.accessor) this['r_'+prop.name](arr, user, false);
					else this[prop.name] = arr;
				}
			}
			else
			{
				_updateMappedObject (data[i], prop.accessor ? this[prop.name]():this[prop.name], this.__map[i].map);
			}
			break;
    }
}

ExternalConnection.prototype.isAlive = function ()
{
    let self = this;
    return new Promise (function (resolve, reject)
    {
        if (!self.connected) return reject(self);
        console.log ('emitting is alive message');
        self.socket.emit ('is-alive');
        let tid = setTimeout (function ()
        {
            console.log ('keep alive timeout');
            if (!self.connected) return reject(self);
            console.log('isAlive for viewer timeout');
            self.socket.removeListener('keep-alive', keepAliveReceived);
            self.once('disconnect', reject.bind(self));
            self.disconnect();
        }, 1000);

        function keepAliveReceived ()
        {
            console.log ('keep alive message received');
            clearTimeout (tid);
            return resolve(self);
        }
        self.socket.once ('keep-alive', keepAliveReceived);
    });
};