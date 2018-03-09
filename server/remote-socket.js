"use strict";
const Validation = require ('./validation');

let EventEmitter = require ('events');
let cache = require("./cache");
let util = require("util");
let RemotedError = require('./remoted-error');
let debug = util.debuglog ('remote');

module.exports = exports = RemoteSocket;

function RemoteSocket (socket)
{
	this.id = socket.id;
	
	this._emitter = new EventEmitter();
	
	// socket.on ('remote-sync-request', _ioSyncRequestHandler.bind (this));
	// socket.on ('remote-update-request', _ioUpdateRequestHandler.bind ( this));
	socket.on ('remote-update', _ioUpdateHandler.bind (this));
	socket.on ('remote-execute', _ioExecuteHandler.bind (this));
	socket.on ('remote-create', _ioCreateHandler.bind (this));
	socket.on ('remote-destroy', _ioDestroyHandler.bind (this));
	
	socket.once ('disconnect', this.destroy.bind(this));
	
	this.socket = socket;
	this.user = socket.user;
	this.connected = true;
	this.instances = {};

	this._instancesDestroyHandlers = {};
	
	// this._syncRequestHandlers = {};
	
	this.registerInstance(socket.user);

	this.query = socket.handshake.query;
}

RemoteSocket.prototype.init = function (data)
{
	data = typeof data === 'object' ? data:{};
	data.remoted.user = {type: this.user.__static.name, data: this.user.toObject(this.user)};
	// data.modules = Modulator.modules(this.user);
	data.serverTime = new Date();
	this.socket.emit ('remote-init', data);
};

/*

function _ioSyncRequestHandler (type)
{
	if (!cache.isRegistered (type)) 
	{
		debug ('sync aborted is not registered '+type);
		return;
	}
	
	debug ('sync request : '+type);
	let self = this;
	if (typeof this._syncRequestHandlers[type] === 'function')
	{
		debug ('sync respond : '+type);
		let val = this._syncRequestHandlers[type](type, this.user);
		if (val instanceof Promise)
		{
			val.then((result) =>
			{
				self.socket.emit ('remote-sync', type, this._ioSyncProcessResult(result));
			});
		}
		else
		{
			this.socket.emit ('remote-sync', type, this._ioSyncProcessResult(val));
		}
	}
}

RemoteSocket.prototype._ioSyncProcessResult = function (instances)
{
	let json = [];
	debug ('process sync handler');
	for (let i in instances)
	{
		this.registerInstance(instances[i]);
		json.push(instances[i].toJSON (this.user));
	}
	return json;
};

function _ioUpdateRequestHandler (type, id)
{
	debug ('update request : '+type);
	if (!cache.isRegistered (type)) return;
	if (!util.isArray (id)) id = [id];
	let result = [];
	let instance;
	for (let i = 0, l=id.length; i<l; i++)
	{
		instance = cache.exists (type, id[i]);
        if (instance)
        {
            this.registerInstance(instance);
            result.push(instance.toJSON(this.user));
        }
        else
        {
            console.log ('instance id : '+id[i] + ' type : '+type+ ' does not exist anymore');
        }
	}
	if (result.length > 0)	
	{
		debug ('update respond : '+type);
		this.emit('remote-update', type, result);
	}
}
*/

function _ioUpdateHandler (uid, type, data)
{
	if (!cache.isRegistered (type)) return;
	debug ('update received : '+type);
	if (!Array.isArray (data)) {
		data = [data];
	}
	let p = [];
	for (let i = 0, l = data.length; i<l; i++)
	{
		let instance = cache.exists (type, data[i]);
		if (instance)
		{
			delete data[i]._id;
			p.push (instance.update(data[i], this.user));
		}
	}
	
	if (uid === false) return;
	let self = this;
	Promise.settle (p).map (function (result)
	{
		if (result.isFulfilled())
		{
			if (result.value().isValid)
			{
				return {fulfilled: true, value: result.value()};
			}
			else
			{
				return {reject: true, reason: result.value()};
			}
		}
		else
		{
			console.log (result.reason().stack);
			return {error: true, reason: "Internal server error"};
		}
	}).then(function (ret)
	{
		if (ret.length == 1) ret = ret[0];
		self.emit ('remote-update-callback-'+uid, ret);
	});
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
}

function _ioExecuteHandler (uid, type, id, method, val)
{
	let self = this;
	let mode = 'x';
	let methodPrefix = '';
	let ret = {};
	let methodFound = false;
	let instance;
	let collection;
	let remoted;

	if (cache.isRegistered (type))
	{
		if (typeof id === 'undefined' || id == null)
		{
			debug ('execute received : static '+method+' on '+type+ ' - with uid : '+uid);
		}
		else
		{
			instance = cache.exists (type, id);
			debug ('execute received '+method+' on '+type+' - '+id+ ' - with uid : '+uid);
		}
		if (instance)
		{
			if (typeof instance['r_'+method] === 'function')
			{
				methodPrefix = 'r_';
				mode = 'w';
				methodFound = true;
				remoted = instance.__reverseMap[method].isRemoted;
			}
			else if (typeof instance[method] === 'function')
			{
				methodFound = true;
			}
			else if (instance.__reverseMap[method] && instance.__reverseMap[method].array && instance.__reverseMap[method].propType === 'remoted' && typeof instance[method]['r_'+arguments[4]] === 'function')
			{
				methodFound = true;
				collection = true;
			}
			if (methodFound)
			{
				if (instance.isAllowed (method, mode, this.user))
				{
					if (mode == 'w' && arguments.length == 4)
					{
						ret.error = 'execution of accessor "'+method+'()" with no value';
						console.error ('Warning : execution of accessor "'+method+'()" with no value for user "'+this.user.name()+'"');
					}
					else
					{
						try
						{
							if (collection)
							{
								ret = instance[method]['r_'+arguments[4]].apply(instance[method], Array.prototype.slice.call (arguments, 5).concat(this));
							}
							else if (remoted)
                            {
                                if (val)
                                {
                                    if (!val._id || !val.__type__)
                                    {
                                        ret.error = 'execution of accessor "' + method + '()" with a non remoted value identifier';
                                        console.error('Warning : execution of accessor "' + method + '()" with a non remoted value identifier for user "' + this.user.name() + '"');
                                    }
                                    else
                                    {
                                        let type = cache.getType(val.__type__);
                                        if (!type)
                                        {
                                            ret.error = 'execution of accessor "' + method + '()" with a non registered type';
                                            console.error('Warning : execution of accessor "' + method + '()" with a non registered type for user "' + this.user.name() + '"');
                                        }
                                        else
                                        {
                                            ret = type.getById(val._id)
                                            .then((val)=>
                                            {
                                                return instance[methodPrefix+method](val, this)
                                            });
                                        }
                                    }
                                }
                                else
                                {
                                    ret = instance[methodPrefix+method](null, this);
                                }
                            }
                            else
                            {
								ret = instance[methodPrefix+method].apply(instance, Array.prototype.slice.call (arguments, 4).concat(this));
							}
						}
						catch (error)
						{
							ret = error;
						}
					}
				}
				else
				{
					if (mode == 'x')
					{
						console.error ('Warning : execution of method "'+method+'()" is not allowed for user "'+this.user.name()+'"');
					}
					else
					{
						console.error ('Warning : write access on property "'+method+'" is not allowed for user "'+this.user.name()+'"');
					}
					ret.error = 'execution of "'+method+'()" on "'+type+'" not allowed';
				}
			}
			else
			{
				console.error ('function "'+method+'()" on "'+type+'" not found');
				ret.error = 'function "'+method+'()" on "'+type+'" not found';
			}
		}
		else if (instance !== false)
		{
			let typeObject = cache.getType (type);
			if (typeObject !== false && typeof typeObject[method] == 'function')
			{
			
				if (!typeObject.isAllowed (method, 'x', this.user))
				{
					console.error ('Warning : execution of static method "'+method+'()" is not allowed for "'+this.user.name()+'"');
					ret.error = 'execution of "'+method+'()" on "'+type+'" not allowed';
				}
				else
				{
					try
					{
						ret = typeObject[method].apply(typeObject, Array.prototype.slice.call (arguments, 4).concat([this]));
					}
					catch (error)
					{
						if (error instanceof Error)
						{
							ret = {error: error};
						}
						else
						{
							ret = {reject: error};
						}
					}
				}
			}
			else
			{
				console.error ('execute received on type "'+type+'" but method "'+method+'()" not found');
				ret.error = 'function "'+method+'()" on "'+type+'" not found';
			}
		}
		else
		{
			console.error ('execute received on type "'+type+'" but instance with id "'+id+'" not found');
			ret.error = 'instance with id"'+id+'" on "'+type+'" not found';
		}
	}
	else
	{
		console.error ('execute received on unknow type "'+type+'"');
		ret.error = 'type "'+type+'" not found';
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
				if (ret instanceof RemotedError)
				{
					ret = {error: true, reason: ret.message};
				}
				else
				{
					console.error (ret);
					ret = {error: true, reason: "internal server error"};
				}
			}
			else if (ret instanceof Promise)
			{
				return ret.then(function(val)
				{
					ret = {fulfilled: true, value: val};
				})
				.catch (RemotedError, function ()
				{
					ret = {error: error.message};
				})
				.catch(function (error)
				{
					if (error instanceof Error)
					{
						console.error (error.stack);
						ret = {error: "internal server error"};
					}
					else
					{
						error = error == undefined ? null:error;
						console.error (error);
						ret = {reject: error};
					}
				})
				.finally (function()
				{
					self.emit ('remote-execute-callback-'+uid, ret);
				});
			}
			else if (ret === null)
			{
				ret = {fulfilled: true, value: null};
			}
			else if (ret.hasOwnProperty('error'))
			{
				ret = {error: true, reason: ret.error}
			}
			else if (ret.hasOwnProperty('reject'))
			{
				ret = {reject: true, reason: ret.reject}
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

function _ioCreateHandler (uid, type, data)
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
}

function _ioDestroyHandler (uid, type, data)
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

RemoteSocket.prototype.hasInstance = function(instance)
{
	if (typeof instance._id === 'undefined')
    {
        throw new Error ('instance of '+instance.__static.name+'must have an _id');
    }
	return this.instances.hasOwnProperty(this.instanceId(instance));
};

RemoteSocket.prototype.registerInstance = function(instance)
{
    if (!instance) return;
	if (this.hasInstance(instance)) return false;
	let instanceId = this.instanceId(instance);
	instance._remoteSockets[this.id] = this;
	this.instances[instanceId] = instance;
	this._instancesDestroyHandlers[instanceId] = this.unregisterInstance.bind(this, instance);
	instance.on ('destroy', this._instancesDestroyHandlers[instanceId]);
	let collection;
    for (let i in instance.__remotedProps)
	{
        if (instance.__remotedProps[i].array)
        {
            collection = instance[instance.__remotedProps[i].name];
            for (let j in collection.list)
            {
                this.registerInstance(collection.list[j]);
            }
        }
        else
        {
            this.registerInstance(instance.__remotedProps[i].accessor ? instance[i]():instance[i]);
        }
	}
	return true;
};

RemoteSocket.prototype.unregisterInstance = function(instance)
{
	if (!this.hasInstance(instance)) return false;
	let instanceId = this.instanceId(instance);
	delete instance._remoteSockets[this.id];
	instance.removeListener ('destroy', this._instancesDestroyHandlers[instanceId]);
	delete this.instances[instanceId];
	delete this._instancesDestroyHandlers[instanceId];
	return true;
}

RemoteSocket.prototype.unregisterAllInstances = function()
{
	for (let i in this.instances)
	{
        delete this.instances[i]._remoteSockets[this.id];
        this.instances[i].removeListener ('destroy', this._instancesDestroyHandlers[i]);
	}
    this.instances = {};
    this._instancesDestroyHandlers = {};
}

RemoteSocket.prototype.instanceId = function (instance)
{
	return instance.__static.name + instance._id;
}

RemoteSocket.prototype.isAlive = function ()
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
            self.socket.removeListener('keep-alive', keepAliveHandler);
            self.once('disconnect', reject.bind(self));
            self.disconnect();
        }, 1000);

        function keepAliveHandler ()
        {
            console.log ('keep alive message received');
            clearTimeout (tid);
            return resolve(self);
        }
        self.socket.once ('keep-alive', keepAliveHandler);
    });
};

RemoteSocket.prototype.kill = function ()
{
    let self = this;
    return new Promise (function (resolve, reject)
    {
        if (!self.connected) return resolve();
        self.emit ('remote-kill');
        let to = setTimeout(function ()
        {
            reject (new Error ("Disconnect timeout for kill user "+self.user.name()+" of "+self.user.client.name+" : "+self.id));
        }, 3000);

        self.once ('disconnect', function ()
        {
            clearTimeout (to);
            resolve();
        });
        self.disconnect();
    });
};

RemoteSocket.prototype.destroy = function ()
{
	this.connected = false;
	this.unregisterAllInstances();
	this._emitter.emit('disconnect', this);
	this.socket.removeAllListeners();
	this._emitter.removeAllListeners();
    delete this.socket.user;
};

/*

RemoteSocket.prototype.registerSyncRequestHandler = function (type, handler, context)
{
	if (context) this._syncRequestHandlers[type] = handler.bind (context);
	else this._syncRequestHandlers[type] = handler;
};
*/

RemoteSocket.prototype.emit = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error ('DEBUG INFO - emit on destroyed socket : ');
            return;
        };
		return this.socket.emit.apply (this.socket, arguments);
	}
	else
	{
		return this._emitter.emit.apply (this._emitter, arguments);
	}
};

RemoteSocket.prototype.on = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error ('DEBUG INFO - addListener on destroyed socket : ');
            return
        };
		this.socket.on.apply (this.socket, arguments);
	}
	else
	{
		this._emitter.on.apply (this._emitter, arguments);
	}
	return this;
};

RemoteSocket.prototype.once = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error('DEBUG INFO - once on destroyed socket : ');
            return
        }
		this.socket.once.apply (this.socket, arguments);
	}
	else
	{
		this._emitter.once.apply (this._emitter, arguments);
	}
	return this;
};

RemoteSocket.prototype.removeListener = function (e)
{
	if (e.startsWith('remote-'))
	{
        if (!this.connected)
        {
            console.error('DEBUG INFO - removeListener on destroyed socket : ');
            return
        }
		this.socket.removeListener.apply (this.socket, arguments);
	}
	else
	{
		this._emitter.removeListener.apply (this._emitter, arguments);
	}
	return this;
};

RemoteSocket.prototype.removeAllListeners = function (e)
{
	if (e.startsWith('remote-'))
	{
		this.socket.removeAllListeners(e);
	}
	else
	{
		this._emitter.removeAllListeners(e);
	}
	return this;
};

RemoteSocket.prototype.disconnect = function()
{
    if (this.connected) this.socket.disconnect();
};