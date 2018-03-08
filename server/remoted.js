"use strict";
const EventEmitter = require ('events');
const Securized = require('./security/securized');
const Validation = require ('./validation');
const privates = require ('./privates');

/**Forbidden keywords

 $deleteDomain
 $destroy
 $domain
 $initialized
 $save
 $setDomain
 $toObject

 **/

class Remoted extends EventEmitter {
	constructor(data)
	{
        super();
        this.setMaxListeners(200);

        /**
         * Wether the instance is initialized or not
         * @member {boolean}
         */
        this.initialized = false;

        this.destroyed = false;
        Securized.call (this);

        //Création des collections dynamiques
        for (let i in this.__static.collections)
        {
            let prop = this.this.__static.collections[i];
			this[prop.name] = RemotedCollection(this, prop);
        }

        //Création des propriétés privées;
		this[privates.timeouts] = {};
		this[privates.intervals] = {};
		this[privates.immediates] = {};
		this[privates.parents] = new Set();
		this[privates.domains] = {};
		this[privates.promises] = {};
		this[privates.deferreds] = {};
        this[privates.saveQueue] = [];
		this[privates.init](data);

		//binds
        this[privates.removeParent] = this[privates.removeParent].bind(this);
    }

    /**
     *
     * @param {string} label
     * @param {string} value
     */
    $setDomain (label, value)
    {
        this[privates.domains][label] = String(value);
    }

    $deleteDomain (label)
    {
        delete this[privates.domains][label];
    }

    /**
     *
     * @param {Object} opts
     * @param {boolean} [opts.keep=true]
     */
    $destroy (opts)
    {
        if (this.destroyed) return;

        // Destroy instance of this object on every connected clients
        Remote.destroy(this);

        for (let i in this[privates.deferreds])
        {
            if (!this[privates.deferreds][i]) continue;
            this[privates.deferreds][i].reject(`${i} aborted, because object was destroyed`);
        }
        this[privates.deferreds] = null;

        for (let i in this[privates.immediates])
        {
            if (!this[privates.immediates][i]) continue;
            clearImmediate(this[privates.immediates][i]);
        }

        for (let i in this[privates.intervals])
        {
            if (!this[privates.intervals][i]) continue;
            clearInterval(this[privates.intervals][i]);
        }

        for (let i in this[privates.timeouts])
        {
            if (!this[privates.timeouts][i]) continue;
            clearInterval(this[privates.timeouts][i]);
        }

        if (this.__static.isPersistent)
        {
            let removeFromDB = true;
            if (opts && opts.hasOwnProperty('keep')) {
                removeFromDB = !opts.keep;
            }
            if (removeFromDB && this.initialized) this[privates.store].remove();
        }

        if (this.parent) this.parent.removeListener ('destroy', this.destroy);

        cache.remove(this);
        this.destroyed = true;
        this.emit('destroy', this, opts);
        this[privates.parent] = null;
        this.removeAllListeners();
    }

    /**
	 * Save changes to database and update them on each connected client.
	 * @params {(string|string[])} [fields] - fields to save. If omitted all fields are saved
     */
    $save (fields)
	{
		if (!Array.isArray(fields)) fields = [fields];
        this[privates.saveQueue].push(...fields);

        if (!this[privates.deferreds].save)
		{
            //Lancement d'un nouveau cycle de sauvegarde.
            return [privates.triggerSaveCycle]();
        }
        else if (this[privates.deferreds].saveNext)
		{
            //Cycle de sauvegarde en cours et deffered du prochain cycle déjà créé.
			return this[privates.deferreds].saveNext;
        }
        else
		{
            //Cycle de sauvegarde en cours. Création du deffered du prochain cycle.
            return this[privates.deferreds].saveNext = helpers.defer();
		}
	}

    /**
     * Convert a dynamix object into a Javascript Plain Object
     * @params {string|string[]|fieldMap} [fields] - fields to insert into the output object. If omitted or null, all fields will be inserted into the output.
     * @params {User} [user] - user object. The output will only contain data that match the user's permissions.
     * @params {boolean} [protectFromCircularReferences=false] - if true, circular references will be replaced by the path of the first occurence an object.
     */
    $toObject (fields = null, user = null, protectFromCircularReferences = false, circularMap = null, path = null)
    {
        if (!this.__static.reverseMap) return {};
        let map = getPropsMap(fields);
        return dynamixToObject(this, map, user, protectFromCircularReferences, circularMap, path);
    };


    //PRIVATE METHODS
    [privates.addParent] (parent)
    {
        if (this[privates.parents].has(parent)) return;
        parent.on ('destroy', this[privates.removeParent]);
        this[privates.parents].add(parent);
    }

    [privates.removeParent] (parent)
    {
        if (!this[privates.parents].has(parent)) return;
        parent.removeListener ('destroy', this[privates.removeParent]);
        this[privates.parents].delete(parent);
        if (this[privates.removeParent].size === 0) this.destroy();
    }

    /**
     *  Schedule a save operation on next event loop (setImmediate)
     */
	[privates.startSaveCycle] ()
	{
		if (this[privates.deferreds].saveNext)
		{
			this[privates.deferreds].save = this[privates.deferreds].saveNext;
            this[privates.deferreds].saveNext = null;
        }
        else
		{
            this[privates.deferreds].save = helpers.defer();
		}

        this[privates.immediates] = setImmediate(()=>
        {
            if (this.destroyed) return;
            let fields = this[privates.saveQueue];
            for (let i = fields.length-1; i>=0; i--)
            {
                this[privates.store].markModified (fields[i]);
            }
            this[privates.saveQueue].length = 0;

            //Update fields on each connected client
            Remote.update(this, fields);

            //Save to database
            if (this.__static.isPersistent)
            {
				this[privates.promises].save = this[privates.store].saveAsync()
				.reflect()
				.then ((inspect) =>
				{
                    if (this.destroyed) return;
                    this[privates.promises].save = null;

                    if (inspect.isFulfilled())
					{
                        this[privates.deferreds].save.resolve(inspect.value());
					}
					else if (inspect.isRejected())
					{
                        this[privates.deferreds].save.reject(inspect.reason());
					}
					else
					{
                        this[privates.deferreds].save.reject('unknown save rejection');
					}

					// On démarre un nouveau  cycle de sauvegarde si fields sont présents dans la queue
					if (this[privates.saveQueue].length)
					{
						this[privates.startSaveCycle]();
					}
				});
			}

            this[privates.immediates].save = null;
        });

        return this[privates.deferreds].save;
    }
}

Securized.implements (Remoted);
exports = module.exports = Remoted;

function dynamixToObject (obj, map, user, protectFromCircularReferences, circularMap, path)
{
    path = path || '';
    if (protectFromCircularReferences)
	{
        circularMap = new Map(circularMap);
        circularMap.set(obj, path);
	}

    const json = {};

    if (typeof obj !== 'object') return json;
    for (let propertyName in map)
    {
        let val = obj[propertyName];
        if (typeof val === 'undefined') continue;

        let prop = map[propertyName];
        if (prop.isPrivate) continue;
        if (user && !obj.isAllowed (propertyName, 'r', user)) continue;

        switch (prop.propType)
        {
            case 'property':
                json[prop.jsonName] = val;
                break;
            case 'remoted':
            case 'mapped-object':
                if (prop.isArray)
                {
                    if (Array.isArray (val))
                    {
                        json[prop.jsonName] = [];
                        if (prop.hasOwnProperty ('map'))
                        {
                            for (let i = 0, l = val.length; i<l; i++)
                            {
                                json[prop.jsonName].push (dynamixToObject(val[i], prop.reverseMap));
                            }
                        }
                        else
                        {
                            json[prop.jsonName] = [];
                            for (let i = 0, l = val.length; i<l; i++)
                            {
                            	let item = val[i];
                            	if (item === null) json[prop.jsonName].push(null);
								else if (protectFromCircularReferences && circularMap.has(val[i]))
								{
									json[prop.jsonName].push(circularMap.get(item));
								}
								else
								{
									json[prop.jsonName].push(item.toObject(prop.fields, user, protectFromCircularReferences, circularMap, path + (path ? '.':'') + propertyName + '.' + i));
								}
							}
                        }
                    }
                }
                else
                {
                    if (!val)
                    {
                        json[prop.jsonName] = null;
                    }
                    else if (map[propertyName].hasOwnProperty ('map'))
                    {
                        json[prop.jsonName] = this.dynamixToObject(val, prop.reverseMap);
                    }
                    else if (protectFromCircularReferences && circularMap.has(val))
					{
						json[prop.jsonName].push(circularMap.get(val));
					}
					else
					{
						json[prop.jsonName] = val.toObject(prop.fields, user, protectFromCircularReferences, circularMap, path + (path ? '.':'') + propertyName);
					}
				}
			break;
        }
    }

    if (obj.__static) {
        json._id= obj.__static.name + '.' + obj._id;
    }

    return json;
}

function getPropsMap (dynamix, fields)
{
	if (typeof fields === 'string')
	{
        if (dynamix.__static.reverseMap.hasOwnProperty(fields))
		{
			return {[field]: this.__reverseMap[field]};
        }
	}
	else if (Array.isArray(fields))
    {
        let map = {};
        for (let i = 0, l = fields.length; i<l; i++)
        {
            let field = fields[i];
            if (typeof fields === 'string')
			{
                if (dynamix.__static.reverseMap.hasOwnProperty(field))
                {
                    map[field] = this.__reverseMap[field];
                }
			}
			else if (field.name && dynamix.__static.reverseMap.hasOwnProperty(field.name))
			{
				map[field.name] = Object.assign({fields: field.fields}, dynamix.__static.reverseMap[field.name]);
			}
        }
    }
    else if (fields && typeof fields === 'object')
    {
        let map = {};
        for (let i in fields)
        {
            if (!dynamix.__static.reverseMap.hasOwnProperty(i)) continue;
            let val = fields[i];
            if (val && typeof val === 'object')
            {
                map[i] = Object.assign({fields: val}, dynamix.__static.reverseMap[i]);
            }
            else
            {
				map[i] = dynamix.__static.reverseMap[i];
            }
        }
    }
    else
	{
        return dynamix.__static.reverseMap;
    }
}




var BaseObject = require('../helpers/baseobject')
,   util = require('util')
,   helpers = require('../helpers/util')
,   RemotedError = require('./remoted-error')
,   Remote = require('./remote')
,   cache = require('./cache')
,   debug = util.debuglog ('remote')
,   mongoose = require ('mongoose')
,   Schema = mongoose.Schema
,   mongooseAdapter = require ('./mongoose-adapter')
,   ValidationPool = require ('../validation/validation-pool')
,   RemotedCollection = require ('./remoted-collection')
,	NotFoundError = require ('../helpers/errors/not-found-error')
,	_ = require ('lodash/core')
,   uuid= require('uuid');




function _updateMappedObject (data, object, map)
{
	
	if (typeof data != 'object') return;
	if (typeof map != 'object') return;
	var prop;
	for (var i in map)
	{
		prop = map[i];
		switch (prop.propType)
		{
			case 'property':
				object[prop.name] = data[i];
			break;
			case 'mapped-object':
			if (prop.array)
				{
					object[prop.name] = [];
					if (util.isArray(data[i]))
					{
						for (var j = 0, l = data[i].length; j<l; j++)
						{
							object[prop.name][j] = {};
							_updateMappedObject (data[i][j], object[prop.name][j], prop.map);
						}
					}
				}
				else
				{
					_updateMappedObject (data[i], object[prop.name], prop.map);
				}
			break;
		}
	}
}

Remoted.prototype.remoteUpdate = function (fields, socket)
{

};

Remoted.prototype.remoteExecute = function (method, socket, remotedInstance)
{
	debug ('remote execute : '+method+'()');
	if (this.__reverseMap[method].propType == 'remoted' && this.__reverseMap[method].accessor)
	{
		Remote.executeRemotedAccessor.apply (Remote, [this, method, socket, remotedInstance]);
	}
	else
	{
		Remote.execute.apply (Remote, [this, method, socket].concat (Array.prototype.slice.call(arguments, 2)));
	}
};

Remoted.prototype._init = function (obj)
{
	var self = this;
	var resInit;

	obj = obj || {};

	try
	{
		if (typeof obj.__dataAdapter__ === 'string' && this.__dataAdapters.hasOwnProperty(obj.__dataAdapter__))
		{
			obj = this.__dataAdapters[obj.__dataAdapter__](obj);
		}
		if (typeof this.preInit === 'function')
		{
			resInit = this.preInit(obj);
			if (resInit instanceof Promise)
			{
				return resInit.then (function(r)
				{
					r = r || obj;
					return self._runInit(r);
				})
				.catch (function (error)
				{
					self.initializeComplete (false, error);
				});
			}
			else if (typeof resInit !== 'object')
			{
				resInit = obj;
			}
		}
		else
		{
			resInit = obj;
		}
		this._runInit(resInit);
	}
	catch(e)
	{
		self.initializeComplete (false, e);
	}
};

Remoted.prototype._runInit = function (obj)
{
	var remotedPromisesHash = {};
	var remotedPromisesArray;
	var hasRemoted = false;
    var obj = obj || {};
	var needSave = false;

	let circularRemotedMap = new Set (obj.__circularRemotedMap__);
	circularRemotedMap.add(this);

	for (let i in this.__map)
	{
		let val;
		let prop = this.__map[i];
		let propName = prop.accessor ? '_'+prop.name : prop.name;
		let notFound = false;
		if (prop.array)
		{
            switch (prop.propType)
            {
                case 'property':
                    if (obj.hasOwnProperty (i))
                    {
                        val = obj[i];
                    }
                    else if (obj.hasOwnProperty (prop.name))
                    {
                        val = obj[prop.name];
                    }
                    if (util.isArray (val))
                    {
                        this[propName] = [];
                        for (let j = 0, l = val.length; j < l; j++)
                        {
                            this[propName].push(this._initProcessProperty(prop, val[j]));
                        }
                    }
                    else
                    {
                        notFound = true;
                    }
                break;
                case 'remoted':
                    let ids = obj[i + '_ids'] || obj[prop.name + 'ids'];
                    if (!util.isArray(ids))
                    {
                        val = obj[i] || obj[prop.name];
                        if (util.isArray(val))
                        {
                            ids = [];
							for (let j = 0, l = val.length; j < l; j++)
							{
								if (val[j]._id && val[j].__static) ids.push({id: val[j]._id, type: val[j].__static.name});
								else if (val[j]._id && val[j].__type__) ids.push({id: val[j]._id, type: val[j].__type__});
							}
						}
					}
					else
					{
						for (let j = 0, l = ids.length; j<l; j++)
						{
							if (typeof ids[j] !== 'object')
							{
								ids[j] = {id: ids[j], type: prop.type};
							}
							else if (ids[j] && !ids[j].type)
							{
								ids[j] = {id: ids[j], type: prop.type};
							}
						}
					}
                    if (util.isArray(ids) && ids.length)
                    {
                        remotedPromisesArray = [];
						for (let j = 0, l = ids.length; j<l; j++)
                        {
							hasRemoted = true;
							let type = cache.getType(ids[j].type);
							if (!type) continue;
							remotedPromisesArray.push(
								type._getById(ids[j].id, circularRemotedMap)
								.then(function (instance)
								{
									if (circularRemotedMap.has(instance)) return instance;
									return instance.initialize();
								})
								.reflect()
							);
						}

						remotedPromisesHash[propName] = Promise.bind(this[prop.name], remotedPromisesArray)
						.filter(function (instanceInspection)
						{
							if (instanceInspection.isFulfilled())
							{
								return true;
							}
							else
							{
								let error = instanceInspection.reason();
								console.error('in ' + this.parent.__static.name);
								console.error(error);
								if (error instanceof NotFoundError)
								{
									this.parent.model[this.persistentPath].remove(error.search);
									this.parent.save(this.persistentPath);
								}
								return false;
							}
						})
						.each(function (instanceInspection)
						{
							this.add(instanceInspection.value())
						})
						.catch(function (error)
						{
							console.error ('some instance was not initialized in '+this.parent.__static.name);
							console.error (error.stack);
						})
                    }
                    notFound = false; /* TODO : à checker */
                break;
                case 'mapped-object':
                    if (obj.hasOwnProperty (i))
                    {
                        val = obj[i];
                    }
                    else if (obj.hasOwnProperty (prop.name))
                    {
                        val = obj[prop.name];
                    }
                    if (util.isArray (val))
                    {
                        let arr = [];
                        for (let j = 0, l = val.length; j < l; j++)
                        {
                            let obj = {};
                            _updateMappedObject(val[j], obj, prop.map);
                            arr[j] = obj;
                        }
                        this[propName] = arr;
                    }
                    else
                    {
                        notFound = true;
                    }
                break;
            }
		}
		else
		{
			switch (prop.propType)
			{
				case 'property':
					if (obj.hasOwnProperty (i))
                    {
                        this[propName] = this._initProcessProperty (prop, obj[i]);
                    }
                    else if (obj.hasOwnProperty (prop.name))
                    {
                        this[propName] = this._initProcessProperty (prop, obj[prop.name]);
                    }
					else	if (this.__static.virtual && prop.hasOwnProperty('default'))
					{
						this[propName] = this._resolveDefaultProperty(prop, prop.default, obj);
					}
					else notFound = true;
				break;
				case 'remoted':
					let instance;
					let id;
					let type;
					if (obj[prop.name] && typeof obj[prop.name] === 'object' && obj[prop.name].isRemoted) /* TODO : check type */
					{
						instance = obj[prop.name].initialize();
						obj[prop.name+'_id'] = obj[prop.name]._id;
					}
					else
					{
						if (obj.hasOwnProperty (i+'_id'))
						{
							id = obj[i+'_id'];
						}
						else if (obj.hasOwnProperty (prop.name+'_id'))
						{
							id = obj[prop.name+'_id'];
						}
						else if (typeof obj[i] === 'object' && obj[i].hasOwnProperty('_id'))
						{
							id = obj[i]._id;
						}
						else if (obj[prop.name] && typeof obj[prop.name] === 'object')
						{
							if (obj[prop.name]._id)
							{
								id = obj[prop.name]._id;
							}
							else if (typeof prop.type === 'function')
							{
								instance = prop.type.create(obj[prop.name]);
								if (!this.__static.virtual) needSave = true
							}
							else if (obj[prop.name].__type__)
							{
								let type = cache.getType(obj[prop.name].__type__);
								if (type && this.isValidPropertyTypeFor(prop.name, type))
								{
									instance = type.create(obj[prop.name]);
									if (!this.__static.virtual) needSave = true
								}
							}
						}
						else if (prop.default)
						{
							instance = this._resolveDefaultRemoted(prop, obj);
							if (instance && !this.__static.virtual) needSave = true;
						}

						if (id)
						{
							if (typeof id !== 'object')
							{
								id = {id: id, type: prop.type};
							}
							else if (!id.type)
							{
								id = {id: id, type: prop.type};
							}

							obj[prop.name+'_id'] = id.id;

							type = cache.getType(id.type);

							instance = type._getById(id.id, circularRemotedMap)
							.then (function(instance)
							{
								if (circularRemotedMap.has(instance)) return instance;
								return instance.initialize();
							});
						}
					}

					if (instance)
					{
						hasRemoted = true;
						remotedPromisesHash[propName] = instance
                        .bind({
                            name: prop.accessor ? '_'+prop.name:prop.name
                        ,   self: this
                        ,   prop: prop
						,	type: type
                        })
                        .catch(NotFoundError, function (e)
                        {
                            if (this.prop.default)
							{
								let p = this.self._resolveDefaultRemoted(this.prop, obj, this.type);
								if (p && !this.__static.virtual) needSave = true;
								return p;
							}
							else
							{
								console.error (e);
							}
                        })
						.catch (function (e)
						{
							console.error (prop.name+ ' is not initialized in '+this.self.__static.name);
							console.error (e);
						})
						.then (function (instance)
                        {
                            if (instance)
                            {
                                this.self[this.name] = instance;
                                if (this.prop.inheritedParent) instance.parent = this.self;
                                if (this.prop.inheritedOwner) instance.chown(this.self.owner());
                            }
                            else if (this.prop.required) throw new Error ('property : "'+this.name+'" is required');
                            else this.self[this.name] = null;
                        });
					}
                    else
                    {
                        notFound = true;
                    }
				break;
				case 'mapped-object':
					if (!this[propName] && prop.default) this[propName] = this._resolveDefaultProperty(prop, prop.default, obj);
					if (typeof this[propName] != 'object') this[propName] = {};
					_updateMappedObject (obj[i] || obj[prop.name], this[prop.name], prop.map);
				break;
			}
		}
		if (notFound && prop.required)
		{
			this.initializeComplete (false, new Error ('property : "'+prop.name+'" is required'));
			return;
		}
	}
	if (hasRemoted)
	{
		Promise.props (remotedPromisesHash)
		.bind(this)
		.then (function ()
		{
			if (needSave) this.save();
			this._resolveInit(obj);
		})
		.catch (function (error)
		{
			this.initializeComplete (false, error);
		});
	}
	else
	{
		this._resolveInit(obj);
	}
};

Remoted.prototype._resolveDefaultProperty = function (prop, val, obj)
{
	switch (typeof val)
	{
		case 'object':
			if (!val) return null;
			return _.cloneDeep(val);
		break;
		case 'function':
            if (val === Date) return new Date();
            if (val === Object) return {};
            if (val === Array) return [];
			return prop.default.call(this, obj[prop.name] || obj[prop.jsonName], obj);
		break;
		default:
			return val;
	}
};

Remoted.prototype._resolveDefaultRemoted = function (prop, obj, type)
{
    var data;
	type = cache.getType(type) || prop.type;
    switch (typeof prop.default)
    {
        case 'function':
            data = prop.default.call(this, obj[prop.name] || obj[prop.jsonName], obj);
            if (data instanceof Promise)
            {
                return data
				.bind(prop)
				.then(function (r)
                {
                    if (r instanceof Remoted)
                    {
                        return r;
                    }
                    else if (r && typeof r === 'object' && typeof type === 'function')
                    {
                        return type.getOneOrCreate(r);
                    }
                });
            }
            else if (typeof type === 'function')
            {
                return data !== null ? type.getOneOrCreate(data) : null;
            }
            break;
        case 'object':
            if (typeof type === 'function') return type.getOneOrCreate(prop.default);
            break;
    }
};

Remoted.prototype._initProcessProperty = function (prop, obj)
{
	if (prop.hasOwnProperty ('type') && !(obj instanceof prop.type))
	{
		if (prop.type !== Boolean) return new prop.type(obj);
	}
	return obj;
};

Remoted.prototype._resolveInit = function (obj)
{
	if (typeof this.init == 'function')
	{
		try
		{
			var resInit = this.init(obj);
		}
		catch (e)
		{
			return this.initializeComplete (false, e);
		}
		if (resInit instanceof Promise)
		{
			resInit
			.bind(this)
			.then (function()
			{
                return this.initializeComplete (true);
                if (typeof this.postInit === 'function') this.postInit();
			})
			.catch (function (error)
			{
				this.initializeComplete (false, error);
			});
		}
		else if (resInit == undefined || resInit === true)
		{
			this.initializeComplete (true);
			if (typeof this.postInit === 'function') this.postInit();
		}
		else
		{
			return this.initializeComplete (false, resInit);
		}
	}
	else
	{
		return this.initializeComplete (true);
		if (typeof this.postInit === 'function') this.postInit();
	}
};


Remoted.prototype.toJSON = function (props, user, circularMap, path)
{
	if (!this.__reverseMap) return {};
	var map;
	if (util.isArray(props) || typeof props == 'string')
	{
		if (typeof props == 'string') props = [props];
		map = {};
		for (var i = 0, l = props.length; i<l; i++)
		{
			if (this.__reverseMap.hasOwnProperty(props[i]))
			{
				map[props[i]] = this.__reverseMap[props[i]];
			}
		}
	}
	else
	{
		path = circularMap;
		circularMap = user;
		user = props;
		map = this.__reverseMap;
	}
	return this._toJSONMapping (this, map, user, circularMap, path);
};

Remoted.prototype._toJSONMapping = function (obj, map, user, circularMap, path)
{
	path = path || '';
	circularMap = new Map(circularMap);
	circularMap.set(obj, path);

	var json = {};
	if (obj.__static)
	{
		json.__type__= obj.__static.name;
	}
	var propertyName;
	var prop;
	var val;

	if (typeof obj == 'function')
	{
		obj = obj();
	}
	if (typeof obj != 'object') return json;
	for (propertyName in map)
	{
		if (typeof obj[propertyName] === 'undefined') continue;
		
		prop = map[propertyName];
		if (prop.private) continue;
		if (user && !this.isAllowed (propertyName, 'r', user))
		{
			continue;
		}
		
		val = prop.accessor ? obj['_'+propertyName] : obj[propertyName];
		
		switch (prop.propType)
		{
			case 'property':
				json[prop.jsonName] = val;
			break;
			case 'remoted':
			case 'mapped-object':
				if (prop.array)
				{
					if (util.isArray (val))
					{
						json[prop.jsonName] = [];
						if (map[propertyName].hasOwnProperty ('map'))
						{
							for (let j = 0, l = val.length; j<l; j++)
							{
								json[prop.jsonName].push (this._toJSONMapping (val[j], prop.reverseMap));
							}
						}
						else if (prop.propType === 'remoted')
						{
							json[prop.jsonName] = [];
							for (var j = 0, l = val.length; j<l; j++)
							{
								if (typeof val[j].toJSON === 'function')
								{
									if (circularMap.has(val[j]))
									{
										json[prop.jsonName].push(circularMap.get(val[j]));
									}
									else
									{
										json[prop.jsonName].push(val[j].toJSON(user, circularMap, path + (path ? '.':'') + propertyName + '.' + j));
									}
								}
								else
								{
									console.error ('toJSON is not a function for property : "'+propertyName+'", cannot convert object to JSON');
								}
							}
						}
					}
				}
				else
				{
					if (!val)
					{
						json[prop.jsonName] = null;
					}
					else if (map[propertyName].hasOwnProperty ('map'))
					{
						json[prop.jsonName] = this._toJSONMapping (val, map[propertyName].reverseMap);
					}
					else if (typeof val.toJSON == 'function')
					{
						if (circularMap.has(val))
						{
							json[prop.jsonName].push(circularMap.get(val));
						}
						else
						{
							json[prop.jsonName] = val.toJSON(user, circularMap, path + (path ? '.':'') + propertyName);
						}
					}
				}
			break;
		}
	}
	return json;
};

Remoted.prototype.hasValidPropertyTypeFor = function (propName, instance)
{
	let type = this.__map[propName].type;
	switch (typeof type)
	{
		case 'string':
			return type === instance.__static.name;
			break;
		case 'function':
			return type === instance.__static;
			break;
		case 'object':
			if (Array.isArray(type))
			{
				for (let i = 0, l = type.length; i<l; i++)
				{
					if (type[i] === instance.__static) return true;
				}
			}
		default:
			return false;
	}
};

Remoted.prototype.destroy = function ()
{
	//console.log ('REMOTED DESTROY : '+this.__static.name);
	Remote.destroy(this);
	return Remoted.__super.prototype.destroy.call(this);
};


Remoted.create = function (data)
{
	var instance = cache.exists (this, data);
		
	if (!instance)
	{
		return cache.get (this, data).initialize();
	}
	else
	{
		Promise.reject (new Error ('already exists'));
	}
};

Remoted.addDataAdapter = function (name, adapter)
{
	this.prototype.__dataAdapters[name] = adapter;
};

Remoted.Error = RemotedError;

Remoted.__dependencyPending = {
    props: {}
,   constructors: {}
,   counts: {}
};

Remoted.__checkForDependencyCompletion = function (constructor)
{
	if (Remoted.__dependencyPending.props.hasOwnProperty(constructor.name))
	{
		var pendingProps = Remoted.__dependencyPending.props[constructor.name];
		var pendingConstructors = Remoted.__dependencyPending.constructors[constructor.name];
		for (let i = 0, l = pendingProps.length; i<l; i++)
		{
            let prop = pendingProps[i];
			if (Array.isArray(prop.type))
			{
				let idx = prop.type.indexOf(constructor.name);
				if (~idx)
				{
                    prop.type[idx] = constructor;
				}
				let validate = true;
				for (let i = 0, l = prop.type.length; i<l; i++)
                {
                    if (typeof prop.type[i] === 'string')
                    {
                        validate = false;
                        break;
                    }
                }
                if (validate)
                {
                    prop.validator.add('remotedType', prop.type);
                }
			}
			else
			{
                prop.type = constructor;
                prop.validator.add('remotedType', constructor);
				if (constructor.virtual) prop.virtual = true;
			}
		}

        for (var i in pendingConstructors)
        {
            var pendingConstructor = pendingConstructors[i];
            Remoted.__dependencyPending.counts[pendingConstructor.name]--;
            if (Remoted.__dependencyPending.counts[pendingConstructor.name] == 0)
            {
                if (!pendingConstructor.virtual)
                {
                    __buildPersistent(pendingConstructor);
                }
                delete Remoted.__dependencyPending.counts[pendingConstructor.name];
                delete pendingConstructor.__hasPendingDependencies;
            }
        }
        delete Remoted.__dependencyPending.props[constructor.name];
        delete Remoted.__dependencyPending.constructors[constructor.name];
    }
};


function getUID () {return uuid();}

Remoted.setMap = function (map, defaultOpts, virtual)
{
	if (typeof map != 'object')
	{
		throw new Error ('Function __buildMap for "'+constructor.name+'" : argument map is not an object');
	}
	if (this.prototype.hasOwnProperty ('__map'))
	{
		throw new Error ('Function __buildMap for "'+constructor.name+'" : map was already been set');
	}
	
	this.prototype.__map = {};
	this.prototype.__reverseMap = {};
	this.prototype.__remotedProps = {};
	this.prototype.__dataAdapters = {};
    this.prototype.isRemoted = true;
	this.NotFoundError = NotFoundError;

	defaultOpts = defaultOpts || {};
	if (!defaultOpts.hasOwnProperty ('required')) defaultOpts.required = false;
	if (!defaultOpts.hasOwnProperty ('private')) defaultOpts.private = false;
	if (!defaultOpts.hasOwnProperty ('nullWhenNotFound')) defaultOpts.nullWhenNotFound = true;
	if (map.hasOwnProperty ('remotedMethods'))
	{
		if (typeof map.remotedMethods === 'object')
		{
			for (var i in map.remotedMethods)
			{
				this.chmod (i, map.remotedMethods[i]);
			}
		}
		delete map.remotedMethods;
	}
	if (map.hasOwnProperty ('remotedStaticMethods'))
	{
		if (typeof map.remotedStaticMethods === 'object')
		{
			for (var i in map.remotedStaticMethods)
			{
				this.chmodStatic (i, map.remotedStaticMethods[i]);
			}
		}
		delete map.remotedStaticMethods;
	}
	if (map.hasOwnProperty ('__CRUD__'))
	{
		if (typeof map.__CRUD__ === 'object')
		{
			if (map.__CRUD__.hasOwnProperty('create'))	this.chmod ('__create__', map.__CRUD__.create);
			if (map.__CRUD__.hasOwnProperty('update'))	this.chmod ('__update__', map.__CRUD__.update);
			if (map.__CRUD__.hasOwnProperty('read'))	this.chmod ('__read__', map.__CRUD__.read);
			if (map.__CRUD__.hasOwnProperty('destroy'))	this.chmod ('__destroy__', map.__CRUD__.destroy);
		}
		delete map.__CRUD__;
	}
	
	if (!map.hasOwnProperty ('_id'))
	{
		if (virtual)
		{
			map._id = ['=', 444, {type: String, default: getUID}];
		}
		else
		{
			map._id = ['=', 444, {type: mongoose.Types.ObjectId, default: mongoose.Types.ObjectId}];
		}
	}

    __buildMap.call(this, map, this.prototype.__map, this.prototype.__reverseMap, this.prototype.__remotedProps, defaultOpts, virtual);
    __compileMap (this.prototype.__map, this);

	this.virtual = virtual;
	if (virtual)
	{
		if (this.prototype.hasOwnProperty('destroy') && typeof this.prototype.destroy === 'function')
		{

			var destroyFn = this.prototype.destroy;
			this.prototype.destroy = function ()
			{
				try
				{
					var r = destroyFn.apply(this, arguments);
				}
				catch (error)
				{
					console.error (error);
					return Remoted.prototype.destroy.apply(this, arguments);
				}
				if (r instanceof  Promise)
				{
					var args = arguments;
					return r.bind(this).then(function()
					{
						Remoted.prototype.destroy.apply(this, args);
					});
				}
				else
				{
					return Remoted.prototype.destroy.apply(this, arguments);
				}
			}
		}
	}
	else if (!this.__hasPendingDependencies)
	{
		__buildPersistent(this);
	}

	Remoted.__checkForDependencyCompletion (this);
};

function __buildPersistent (constructor)
{
    constructor.schema = __compileMongooseSchema (constructor.prototype.__map);
    constructor.model = mongoose.model(constructor.name, constructor.schema);
    __linkModel (constructor.prototype.__map, constructor);
    mongooseAdapter(constructor);
}

function __buildMap (map, buildMap, buildReverseMap, remotedProps, defaultOpts, virtual)
{
	var validator;

	for (let i in map)
	{
		let isArray = false;
		if (!util.isArray(map[i]) || map[i].length == 1) map[i] = [map[i]];
		
		if (util.isArray(map[i][0]))
		{
			map[i][0] = map[i][0][0];
			isArray = true;
		}
		let opts;
		let validators;
		let buildProp = {};
		let prop = map[i][0];
		let mode = map[i][1] || '000';
		let tmpOpts = map[i][2];
		let hasPendingDependency = false;
		let validatorHasPendingDepency = false;
		let type = typeof tmpOpts === 'function' ? tmpOpts:(typeof map[i][3] === 'function' || Array.isArray(map[i][3]) ? map[i][3]:undefined);
		if (map[i].length > 3) validators = map[i][map[i].length-1];
		if (validators === type || validators === tmpOpts) validators = undefined;

		switch (typeof tmpOpts)
		{
			case 'object':
				opts = tmpOpts;
				for (var k in defaultOpts)
				{
					if (!opts.hasOwnProperty(k)) opts[k] = defaultOpts[k];
				}
			break;
			case 'string':
				opts = {};
				for (var k in defaultOpts)
				{
					opts[k] = defaultOpts[k];
				}
				tmpOpts = tmpOpts.split (' ');
				for (var o = tmpOpts.length-1; o>=0; o--)
				{
					switch (tmpOpts[o])
					{
						case 'r':
						case 'required':
							opts.required = true;
						break;
						case 'o':
						case 'optional':
							opts.required = false;
						break;
						case 'date':
							opts.type = Date;
						break;
						case 'unique':
							opts.unique = true;
						break;
						case 'persistent':
							opts.virtual = false;
						break;
						case 'virtual':
							opts.virtual = true;
							opts.required = false;
						break;
						case 'private':
							opts.private = true;
						break;
						case 'public':
							opts.private = false;
						break;
						case 'array':
							opts.array = true;
						break;
					}
				}
			break;
			default:
				opts = {};
				for (var k in defaultOpts)
				{
					opts[k] = defaultOpts[k];
				}
		}
		if (isArray) opts.array = true;
		
		if (typeof type === 'function' || Array.isArray(type)) opts.type = type;
		switch (typeof prop)
		{
			case 'boolean' :
				if (prop)
				{
					buildProp.name = i;
					buildProp.jsonName = i;
					buildProp.propType = 'property';
				}
			break;
			case 'string':
				buildProp.propType = 'property';
				if (prop.endsWith('()'))
				{
					buildProp.accessor = true;
					prop = prop.slice (0, -2);
				}
				else
				{
					buildProp.accessor = false;
				}
				if (opts.hasOwnProperty ('map'))
				{
					buildProp.propType = 'mapped-object';
					buildProp.map = {};
					buildProp.reverseMap = {};
					
					__buildMap (opts.map, buildProp.map, buildProp.reverseMap, {}, defaultOpts);
				}
				
				if (opts.hasOwnProperty ('type'))
				{
                    if (typeof opts.type === 'string' && opts.type !== '*')
                    {
                        if (cache.isRegistered(opts.type))
                        {
                            opts.type = cache.getType(opts.type);
							if (opts.type.virtual) opts.virtual = true;
                        }
                        else
                        {
                            hasPendingDependency = true;
                            this.__hasPendingDependencies = true;
                            if (!Remoted.__dependencyPending.props.hasOwnProperty(opts.type))
                            {
                                Remoted.__dependencyPending.props[opts.type] = [];
                                Remoted.__dependencyPending.constructors[opts.type] = {};
                            }
                            if (!Remoted.__dependencyPending.counts.hasOwnProperty(this.name))
                            {
                                Remoted.__dependencyPending.counts[this.name] = 1;
                            }
                            else
                            {
                                if(!Remoted.__dependencyPending.constructors[opts.type].hasOwnProperty(this.name)) Remoted.__dependencyPending.counts[this.name]++;
                            }
                            Remoted.__dependencyPending.props[opts.type].push(buildProp);
                            Remoted.__dependencyPending.constructors[opts.type][this.name] = this;
                        }
                        buildProp.propType = buildProp.propType = 'remoted';
                    }
					else if (Array.isArray(opts.type))
					{
						for (let t = 0, l = opts.type.length; t<l; t++)
						{
							if (typeof opts.type === 'string')
							{
								if (cache.isRegistered(opts.type[t]))
								{
									opts.type[t] = cache.getType(opts.type[t]);
								}
								else
								{
                                    hasPendingDependency = true;
									this.__hasPendingDependencies = true;
									if (!Remoted.__dependencyPending.props.hasOwnProperty(opts.type[t]))
									{
										Remoted.__dependencyPending.props[opts.type[t]] = [];
										Remoted.__dependencyPending.constructors[opts.type[t]] = {};
									}
									if (!Remoted.__dependencyPending.counts.hasOwnProperty(this.name))
									{
										Remoted.__dependencyPending.counts[this.name] = 1;
									}
									else
									{
										if (!Remoted.__dependencyPending.constructors[opts.type[t]].hasOwnProperty(this.name)) Remoted.__dependencyPending.counts[this.name]++;
									}
									Remoted.__dependencyPending.props[opts.type[t]].push(buildProp);
									Remoted.__dependencyPending.constructors[opts.type[t]][this.name] = this;
								}
							}
						}
						buildProp.propType = buildProp.propType = 'remoted';
					}
                    else if (Remoted.has (opts.type))
					{
						buildProp.propType = buildProp.propType = 'remoted';
						if (opts.type.virtual) opts.virtual = true;
					}
				}
				buildProp.name = prop === '=' || prop === '' ? i:prop;
				buildProp.jsonName = i;
			break;
		}
		
		buildProp.required = opts.required ? true:(typeof opts.required !== 'undefined' ? false:typeof opts.default === 'undefined');
		buildProp.private = !!opts.private;
		buildProp.array = !!opts.array;
		buildProp.mode = mode;
		buildProp.virtual = virtual ? true:(opts.virtual ? true:!opts.persistent);
		buildProp.hasValidator = false;
		buildProp.isRemoted = buildProp.propType === 'remoted';
		if (opts.hasOwnProperty ('type')) buildProp.type = opts.type;
		if (opts.index) buildProp.index = true;
		else if (opts.unique) buildProp.unique = true;
		if (opts.hasOwnProperty ('default'))
		{
			buildProp.default = opts.default;
			if (buildProp.propType != 'remoted') buildProp.required = false;
		}
		
		validator = new ValidationPool ();
		
		if (buildProp.required)
		{
			validator.add ('required');
		}
		if (buildProp.propType === 'remoted')
        {
            if (!hasPendingDependency) validator.add('remotedType', buildProp.type);
            else validatorHasPendingDepency = true
        }
        else if (buildProp.hasOwnProperty('type'))
		{
			switch (buildProp.type)
			{
				case String:
					validator.add ('stringType');
				break;
				case Number:
					validator.add ('numberType');
				break;
				case Date:
					validator.add ('dateType');
				break;
				case Boolean:
					validator.add ('booleanType');
				break;
				case Array:
					validator.add ('arrayType');
				break;
				case Schema.Types.ObjectId:
					validator.add ('objectIdType');
				break;
				case Schema.Types.Mixed:
				break;
				default:
					//validator.add('type', {type: buildProp.type});
			}
		}
		if (typeof validators === 'object')
		{
			for (var j in validators)
			{
				validator.add (j, validators[j]);
			}
		}
		
		if (validator.length>0 || validatorHasPendingDepency)
		{
			buildProp.hasValidator = true;
			buildProp.validator = validator;
		}
		
		if (buildProp.hasOwnProperty ('name'))
		{
			buildMap[buildProp.jsonName] = buildReverseMap[buildProp.name] = buildProp;
            if (buildProp.propType === 'remoted')
            {
                buildProp.inheritedParent = !!opts.inheritedParent;
                buildProp.inheritedOwner = !!opts.inheritedOwner;
                remotedProps[buildProp.name] = buildProp;
            }
		}
	}
}

function __compileMap (map, constructor)
{
    var hasParentInheritance = false;
    var hasOwnerInheritance = false;

	var prop;
	for (var i in map)
	{
		prop = map[i];
		
		switch (prop.propType)
		{
			case 'property':
				if (prop.accessor)
				{
					Remoted.__createAccessor (constructor, prop.name, prop.virtual);
				}
				else
				{
					Remoted.__createProperty (constructor, prop.name);
				}
			break;
			case 'remoted':
				if (prop.accessor) Remoted.__createAccessor (constructor, prop.name, prop.virtual);
                if (!prop.array) hasParentInheritance += prop.inheritedParent;
                hasOwnerInheritance += prop.inheritedOwner;
                if (cache.hasIndex(constructor.name, prop.name))
                {
                    Remoted.__createRemotedIdAccessor (constructor, prop.name);
                }
			break;
		}
		constructor.chmod (prop.name, prop.mode);
	}
	if (!map.hasOwnProperty('id'))
	{
		Object.defineProperty (constructor.prototype, 'id', {
			get: function () { return this._id; }
		});
	}

    if (hasOwnerInheritance)
    {
        constructor.prototype.chown = function (owner)
        {
            Securized.prototype.chown.call (this, owner);
            for (var i in this.__remotedProps)
            {
                if (!this.__remotedProps[i].inheritedParent) continue;
                if (this.__remotedProps[i].array)
                {
                    for (var j in this[this.__remotedProps[i].name].list)
                    {
                        this['$_'+this.__remotedProps[i].name].list[j].chown (owner);
                    }
                }
                else if (this['$_'+this.__remotedProps[i].name])
                {
                    this['$_'+this.__remotedProps[i].name].chown(owner);
                }
            }
        }
    }

    /*
    if (hasParentInheritance)
    {
        Util.overrideDescriptor(constructor, 'parent', {
            get: 'inherited'
        ,   set: function (val, superSetter)
            {
                superSetter.call (this, val);
                for (var i in this.__remotedProps)
                {
                    if (!this.__remotedProps[i].inheritedParent || this.__remotedProps[i].array) continue;
                    if (this[this.__remotedProps[i].name])
                    {
                        this[this.__remotedProps[i].name].parent = val;
                    }
                }
            }
        });
    }
    */
}

function __compileMongooseSchema (map)
{
	var schema = new Schema (__buildMongooseSchema (map), {id: false});
	var prop;
	var primaries = [];
	for (var i in map)
	{
		prop = map[i];
		if (prop.propType == 'remoted')
		{
			if (prop.array)
			{
			
			}
			else
			{
				schema.virtual (prop.name).set (Remoted.__createModelVirtualSetter (prop.name));
			}
		}
		if (prop.primary)
		{
			primaries.push (prop);
		}
	}
	for (var i = primaries.length-1; i>=0; i--)
	{
		
	}
	return schema;
}

Remoted.__createModelVirtualSetter = function (name)
{
	name = name+'_id';
	return function (val)
	{
		this[name] = val._id;
	}
};

function __buildMongooseSchema (map)
{
	let schema = {};
    let prop;
    let schemaProp;
    let schemaPropName;

	for (let i in map)
	{
		prop = map[i];
		if (prop.virtual) continue;
		
		schemaProp = {};
		if (prop.propType !== 'remoted')
        {
            var propType = prop.type ? prop.type.name : ''
            switch (propType)
            {
                case 'String':
                case 'Number':
                case 'Date':
                case 'Boolean':
                case 'Array':
                case 'ObjectId':
                    schemaProp.type = prop.type;
                    break;
                default:
                    schemaProp.type = Schema.Types.Mixed
            }


            if (prop.hasOwnProperty('default'))
            {
                schemaProp.default = prop.default;
            }
        }

		if (prop.index)
		{
			schemaProp.index = true;
		}
		else if (prop.unique)
		{
			schemaProp.unique = true;
		}
		
		switch (prop.propType)
		{
			case 'property':
				schemaPropName = prop.name;
			break;
			case 'remoted':
				//schemaProp.type = prop.type.schema.tree._id.type;
				/*
                try
                {
                    var idType = prop.type.prototype.__map._id.type.name;
                }
                catch (err)
                {
                    var idType = '';
                }
                switch (idType)
                {
                    case 'String':
                    case 'Number':
                    case 'Date':
                    case 'Boolean':
                    case 'Array':
                    case 'ObjectId':
                        schemaProp.type = prop.type.prototype.__map._id.type;
                        break;
                    default:
                        schemaProp.type = Schema.Types.Mixed
                }
				*/
                if (prop.array)
                {
                    schemaPropName = prop.name + '_ids';
                }
                else
                {
                    schemaPropName = prop.name + '_id';
                }
				schemaProp.type = Schema.Types.Mixed;

            break;
			case 'mapped-object':
				schemaPropName = prop.name;
				schemaProp = __buildMongooseSchema (prop.map);
			break;
		}
		schema[schemaPropName] = prop.array ? [schemaProp]:schemaProp;
	}
	return schema;
}

function __linkModel (map, constructor)
{
	var prop;
	var propName;
	for (var i in map)
	{
		prop = map[i];
		propName = prop.accessor ? '_'+prop.name:prop.name;

		if (propName)
		{
			if (prop.propType == 'remoted')
			{
                if (prop.array)
                {
                    Object.defineProperty(constructor.prototype, propName, {
                          get: Remoted.__createModelRemotedCollectionLinkGetter(prop.name)
                        , set: Remoted.__createModelRemotedCollectionLinkSetter(prop.name)
                    });
                }
                else
                {
                    Object.defineProperty(constructor.prototype, propName, {
                          get: Remoted.__createModelRemotedLinkGetter(prop.name)
                        , set: Remoted.__createModelRemotedLinkSetter(prop.name)
                    });
                }
			}
			else
			{
				Object.defineProperty (constructor.prototype, propName, {
					get : Remoted.__createModelLinkGetter (prop.name)
				,   set : Remoted.__createModelLinkSetter (prop.name)
				});
			}
		}
	}
}

Remoted.__createModelLinkGetter = function (name)
{
	return function ()
	{
		return this.model[name];
	}
};

Remoted.__createModelLinkSetter = function (name)
{
	return function (val)
	{
		this.model[name] = val;
	}
};

Remoted.__createModelRemotedLinkGetter = function (name)
{
	var localname = '$_'+name;
	return function ()
	{
		return this[localname];
	}
};

Remoted.__createModelRemotedLinkSetter = function (name)
{
	var localname = '$_'+name;
    var destroyHandlers = new WeakMap();

    function getDestroyHandler (instance)
    {
        if (destroyHandlers.has(instance)) return destroyHandlers.get(instance);
        var handler = onDestroy.bind(instance);
        destroyHandlers.set(instance, handler);
        return handler;
    }

	function onDestroy (val)
    {
        if (this[localname] === val)
        {
            this[localname] = null;
            this.model[name+'_id'] = null;
            this.save(name);
        }
    }

	return function (val)
	{
	    if (this[localname])
        {
            this[localname].removeListener('destroy', getDestroyHandler(this));
        }
		this[localname] = val;
		if (val === null)
		{
			this.model[name+'_id'] = null;
		}
		else 
		{
		    val.once('destroy', getDestroyHandler(this));
			this.model[name+'_id'] = {id: val._id, type: val.__static.name};
		}
		this.model.markModified(name+'_id');
	}
};

Remoted.__createModelRemotedCollectionLinkGetter = function (name)
{
    var localname = '$_'+name;
    return function ()
    {
        return this[localname];
    }
};

Remoted.__createModelRemotedCollectionLinkSetter = function (name)
{
    var localname = '$_'+name;
    return function (val)
    {
        this[localname] = val;
        this.model[name+'_ids'] = val.getIds();
        this.model.markModified(name+'_ids');
    }
};

Remoted.__createRemotedIdAccessor = function (constructor, name)
{
    Object.defineProperty(constructor.prototype, name+'_id', {
        get: function ()
        {
            if (this[name]) return this[name]._id;
            return null;
        }
    });
};

Remoted.__createProperty = function (constructor, name)
{
	if (typeof constructor.prototype[name] == 'function')
	{
		constructor.prototype['__'+name] = constructor.prototype[name]; 
		delete constructor.prototype[name];
	}
};

Remoted.__createAccessor = function (constructor, name, virtual)
{
	if (typeof constructor.prototype[name] === 'function')
	{
		constructor.prototype['__'+name] = constructor.prototype[name]; 		
		constructor.prototype[name] = this.__localHookedAccessor (name, virtual);
		constructor.prototype['r_'+name] = this.__remoteHookedAccessor (name, virtual);
	}
	else
	{
		constructor.prototype[name] = this.__localAccessor (name, virtual);
		constructor.prototype['r_'+name] = this.__remoteAccessor (name, virtual);
	}
};

Remoted.__localHookedAccessor = function (n, virtual)
{
	return function (val)
	{
		var name, nVal;
		name = n;
		if (typeof val === 'undefined') return this['_'+name];
		if (this['_'+name] === val) return this['_'+name];
		nVal = this['__'+name](val);
		
		if (typeof nVal === 'undefined') nVal = val;
		else if (nVal instanceof Promise)
		{
			return nVal.bind(this).then (function (nVal)
			{
				if (typeof nVal === 'undefined') nVal = val;
				if (this['_'+name] !== nVal) this['_'+name] = nVal;
				this.remoteExecute (name, false, nVal);
				if (!virtual) this.save(name);
				return nVal;
			});
		}
		if (this['_'+name] !== nVal) this['_'+name] = nVal;
		this.remoteExecute (name, false, nVal);
		if (!virtual) this.save(name);
		return nVal;
	};
};

Remoted.__remoteHookedAccessor = function (n, virtual)
{
	return function (val, socket, validation)
	{
		var name, nVal;
		name = n;
		if (val == undefined) return this['_'+name];
		if (this['_'+name] === val) return Promise.resolve(val).bind(this);
		
		//Validation
		validation = typeof validation === 'undefined' ? true:validation;
		if (validation)
		{
			var result = Validation.validateOne(this, name, val, socket.user);
			if (result.isInvalid)
			{
				throw result;
			}
		}
		
		nVal = this['__'+name](val, socket.user, socket);
		if (typeof nVal === 'undefined') nVal = val;
		else if (nVal instanceof Promise)
		{
			return nVal.bind(this).then (function (nVal)
			{
				if (nVal == undefined)	nVal = val;
				if (this['_'+name] !== nVal)
				{
					this['_'+name] = nVal;
				}
				this.remoteExecute (name, socket, nVal);
				if (!virtual) this.save(name);
				return nVal;
			});
		}
		if (this['_'+name] !== nVal)
		{
			this['_'+name] = nVal;
		}
		this.remoteExecute (name, nVal !== val ? false:socket, nVal);
		if (!virtual) this.save(name);
		return Promise.resolve(nVal).bind(this);
	};
};

Remoted.__localAccessor = function (name, virtual)
{
	return function (val)
	{
		if (typeof val === 'undefined') return this['_'+name];
		if (this['_'+name] === val) return this['_'+name];
		this['_'+name] = val;
		this.remoteExecute (name, false, val);
		if (!virtual) this.save(name);
		return val;
	};
};

Remoted.__remoteAccessor = function (n, virtual)
{
	return function (val, socket, validation)
	{
		var name = n;
		if (typeof val === 'undefined') return this['_'+name];
		if (this['_'+name] === val) return this['_'+name];
		
		//Validation
		validation = typeof validation === 'undefined' ? true:validation;
		if (validation)
		{
			var result = validation.validateOne(this, name, val, socket.user, socket);
			if (result.isInvalid)
			{
				throw result;
			}
		}
		
		this['_'+name] = val;
		var self = this;
		
		//A voir si c'est bien
		setImmediate (function () {self.remoteExecute (name,socket, val)});
		if (!virtual) this.save(name);
		return val;
	};
};

Remoted.getOneOrCreate = function (search, data)
{
	return cache.getOneByOrCreate(this, search, data).initialize();
};

Remoted.getOne = function (search)
{
    var s = cache.getOneBy(this, search);
	if (s) return s.initialize();
	else return Promise.reject(new NotFoundError(this.__static.name+' not found', search));
};

Remoted.get = function (search)
{
    return Promise.map (cache.getBy(this, search), function (instance)
    {
        return instance.initialize();
    });
};