const helpers = require('../helpers');
const privates = require ('../privates');

function initialize (dynamix, data)
{
    const steps = [];

    if (typeof dynamix.willInitialize === 'function')
    {
        steps.push({
            step () {
                return dynamix.willInitialize(data)
            },
            done (value) {
                data = value || data;
            }
        });
    }

    if (data instanceof dynamix.__static.model)
    {
        // Recover from DB
        dynamix[privates.store] = data;
        steps.push(() => hydrateFromDB(dynamix, data));
    }
    else
    {
        this.model = new this.__static.model();
/*
        this.hookInit(function (next)
        {
            this.saveAsync()
            .then(next)
            .catch(next);
        });
*/
        steps.push(() => hydrate(dynamix, data));
    }

    if (typeof dynamix.didInitialize === 'function')
    {
        steps.push(() => dynamix.didInitialize());
    }
};

    //VS




function hydrate (dynamix, data = {})
{
    const map = dynamix.__static.map;
    const store = dynamix[privates.store];
    const virtualStore = dynamix[privates.virtualStore];

    let needSave = false;
    let hasChild = false;


    let circularRemotedMap = new Set (obj.__circularRemotedMap__);
    circularRemotedMap.add(this);

    for (let propName in map)
    {
        let prop = map[propName];
        let notFound = false;
        let isDefaultValue = false;

        let val = typeof data[propName];
        if (typeof val === 'undefined' && prop.defaultValue) {
            val = prop.defaultValue(dynamix, data);
            isDefaultValue = true;
        }

        switch (prop.propType)
        {
            case 'property':
                if (prop.isArray)
                {
                    if (util.isArray (val))
                    {
                        store[propName] = val.map(prop.initializeValue); //todo move initializeProperty to prop initializeValue
                    }
                    else
                    {
                        store[propName] = [];
                    }
                }
                else
                {
                    if (typeof val !== 'undefined')
                    {
                        store[propName] = prop.initializeValue(val);
                    }
                    else notFound = true;
                }
            break;
            case 'remoted':
                if (prop.isArray)
                {
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
                }
                else
                {
                    if (val && !(val instanceof Remoted))
                    {
                        switch (typeof val)
                        {
                            case 'string':
                                val = cache.getFromString(val);
                            break;
                            case 'object':
                                if (cache.isRegistered(val._type))
                                {
                                    val = cache.exists(val._type, val._id);
                                    break;
                                }
                            default:
                                val = null;
                        }
                    }

                    if (val)
                    {
                        if (val.initialized)
                        {
                            this[prop.symbol] = val;
                        }
                        else
                        {

                        }
                        if (isDefaultValue) needSave = true;
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
                        virtualStore[propName] = null;
                        notFound = true;
                    }
                }
            break;
        }


        //All array props
        if (prop.isArray)
        {
            switch (prop.propType)
            {
                case 'remoted':

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
}

function hydrateFromDB (dynamix, data = {})
{
    const map = dynamix.__static.map;

    let needSave = false;
    let hasChild = false;

    let circularRemotedMap = new Set (obj.__circularRemotedMap__);
    circularRemotedMap.add(this);


    for (let propName in map)
    {
        let prop = map[propName];
        if (prop.propType === 'remoted')
        {
            if (prop.array)
            {
                if (util.isArray(obj[prop.name + '_ids']))
                {
                    let ids = obj[prop.name + '_ids'];
                    if (ids.length)
                    {
                        remotedPromisesArray = [];

                        for (let j = 0, l = ids.length; j < l; j++)
                        {
                            hasRemoted = true;
                            let type = cache.getType(ids[j].type);
                            if (!type || !ids[j].id) continue;
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
                        remotedPromisesHash.push(
                            Promise.bind( this[prop.name], remotedPromisesArray)
                            .filter(function (instanceInspection)
                            {
                                if (instanceInspection.isFulfilled())
                                {
                                    return true;
                                }
                                else
                                {
                                    let error = instanceInspection.reason();
                                    console.error('Some '+error.typeName+' was Not found in ' + this.parent.__static.name);
                                    console.error (error.search);
                                    if (error instanceof NotFoundError)
                                    {
                                        console.log ('remove entry from collection');
                                        this.parent.model[this.persistentPath].remove({id: error.search, type: error.typeName});
                                        this.parent.save(this.path);
                                    }
                                    return false;
                                }
                            })
                            .each(function (instanceInspection)
                            {
                                this._add(instanceInspection.value())
                            })
                            .catch(function (error)
                            {
                                console.error('some instance was not initialized in ' + this.parent.__static.name);
                                console.error(error);
                            })
                        );
                    }
                }
            }
            else
            {
                let instance;
                let type;
                let id = obj[prop.name + '_id'];
                if (id && id.id)
                {
                    type = cache.getType(id.type);
                    instance = type._getById(id.id, circularRemotedMap)
                    .then(function (instance)
                    {
                        if (circularRemotedMap.has(instance)) return instance;
                        return instance.initialize()
                    });
                }
                else if (obj[prop.name] && typeof obj[prop.name] === 'object' && this.hasValidPropertyTypeFor(prop.name, obj[prop.name]))
                {
                    instance = obj[prop.name];
                }
                else if (prop.default)
                {
                    instance = this._resolveDefaultRemoted(prop, obj);
                    if (instance) needSave = true;
                }
                if (instance)
                {
                    hasRemoted = true;
                    remotedPromisesHash.push(instance
                    .bind({
                        prop: prop
                        ,   self: this
                        ,	obj: obj
                        ,	id: id
                    })
                    .catch(NotFoundError, function (error)
                    {
                        if (this.prop.default)
                        {
                            var p = this.self._resolveDefaultRemoted(this.prop, obj);
                            if (p)
                            {
                                needSave = true;
                                return p;
                            }
                        }
                        else
                        {
                            console.error('Instance of '+error.typeName+' was Not found in ' + this.self.__static.name);
                            console.error (error.search);
                        }
                    })
                    .catch (function (e)
                    {
                        console.error (e);
                    })
                    .then(function (instance)
                    {
                        if (!this) throw new Error ('Cannnot complete remoted initialization');
                        if (instance)
                        {
                            this.self[this.prop.accessor ? '_'+this.prop.name:this.prop.name] = instance;
                            if (this.prop.inheritedParent)
                            {
                                instance.parent = this.self;
                            }
                            if (this.prop.inheritedOwner) instance.chown(this.self.owner());
                        }
                        else if (this.prop.required) throw new Error ('property : "'+this.prop.name+'" is required in '+this.self.__static.name);
                        else if (this.prop.nullWhenNotFound) this.self[this.prop.accessor ? '_'+this.prop.name:this.prop.name] = null;
                    }));
                }
                else if (prop.required)
                {
                    this.initializeComplete(false, new Error('remoted property : "' + i + '" is required'), dbCleaning ? [false]:undefined);
                    return;
                }
            }
        }
        else if (prop.required && (typeof obj[prop.name] === 'undefined' || obj[prop.name] === null))
        {
            this.initializeComplete (false, new Error ('property : "'+i+'" is required'), dbCleaning ? [false]:undefined);
            return;
        }
    }
    if (hasRemoted)
    {
        Promise.all (remotedPromisesHash)
        .bind(this)
        .then(function ()
        {
            return this.model.validateAsync();
        })
        .then (function ()
        {
            if (needSave) this.save();
            return this._resolveInit(obj);
        })
        .catch (function (error)
        {
            this.initializeComplete (false, error, dbCleaning ? [false]:undefined);
        });
    }
    else
    {
        return this.model.validateAsync()
        .bind(this).then (function ()
        {
            return this._resolveInit(obj);
        })
        .catch (function(err)
        {
            console.error (err.stack);
        });
    }
};

adapter.prototype._resolveInit = function (obj)
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
            .catch (function (error)
            {
                this.initializeComplete (false, error);
            })
            .then (function ()
            {
                return this.model.validateAsync()
                .catch (function (err)
                {
                    console.error (err.stack);
                });
            })
            .then (function()
            {
                this.initializeComplete (true);
                if (typeof this.postInit === 'function') this.postInit();
            });
        }
        else if (resInit == undefined || resInit === true)
        {
            return this.model.validateAsync()
            .bind(this)
            .then(function ()
            {
                this.initializeComplete (true);
                if (typeof this.postInit === 'function') this.postInit();
            })
            .catch (function (err)
            {
                console.error (err.stack);
            });
        }
        else
        {
            return this.initializeComplete (false, resInit);
        }
    }
    else
    {
        return this.model.validateAsync()
        .bind(this)
        .then(function ()
        {
            this.initializeComplete (true);
            if (typeof this.postInit === 'function') this.postInit();
        })
        .catch (function (err)
        {
            console.error (err.stack);
        });
    }
};

//CLASSIC
function initializeRemotedValue (prop, data)
{
    if (!data)
    {
        data = this._resolveDefaultRemoted(prop, obj);
        if (instance && !this.__static.virtual) needSave = true;
    }

    if (data instanceof Remoted)
    {
        if (data.$initialized) return data;
        else return data.$initialize();
    }
}

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

function initializeProperty (prop, value)
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
