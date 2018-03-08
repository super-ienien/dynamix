"use strict";

const EventEmitter = require ('events');
const cache = new Map();
const watcher = new EventEmitter();
watcher.setMaxListeners(200);

module.exports = exports = {
    add
,   cache
,   exists
,   get
,   getBy
,   getOneBy
,   getOneByOrCreate
,   getType
,   hasIndex
,   isRegistered
,   register
,   remove
,   updateIndex
,   watcher
};

function add (instance)
{
    let typeInfos = cache.get(instance.__static.name);
    let id = String(instance._id);

    if (typeInfos.cache.has[id])
    {
        console.log ('CACHE : instance already exists');
        return;
    }

    typeInfos.cache.set(id, instance);

    instance.initialize()
    .then(function()
    {
        watcher.emit ('new', type, instance);
        watcher.emit ('new'+type, instance);
        if (instance.client && typeof instance.client === 'object')
        {
            watcher.emit ('new'+type+instance.client._id, instance);
        }
    });
}

function exists(type, id)
{
    return cache.get(type).instances.get(String(id)) || false;
}

function get (type, arg1, arg2)
{
    const typeInfos = getTypeInfos(type);
    let data;
    let id;
    let instance;

    if (typeof arg1 === 'object')
    {
        data = arg1;
        id = String(arg1._id);
    }
    else
    {
        id = String(arg1);
        data = arg2;
    }

    if (typeof id !== 'undefined' && (instance = typeInfos.cache.get(id)))
    {
        console.log ('get '+instance+' from cache');
        return instance;
    }

    if (typeof data !== 'undefined' && data instanceof typeInfos.constructor)
    {
        instance = data;
    }
    else
    {
        instance = new typeInfos.constructor(data);
        console.log ('create '+instance+' from cache');
    }

    if (instance._id)
    {
        add (instance);
    }
    else
    {
        console.log('CACHE : Instance Does not have any ID');
        instance.initialize()
        .then(function(instance)
        {
            add (instance);
        });
    }

    return instance;
}

function getBy (type, search)
{
    if (search._id) return exists (type, search._id);

    let typeInfos = cache.get(type);
    if (!typeInfos.indices.size) return [];

    let results = new Set();
    let first = true;
    for (let i in search)
    {
        let index = typeInfos.indices.get(i);
        if (!index) return [];

        let val = search[i];
        let instances = false;
        if (val instanceof RegExp)
        {
            let keys = Array.from(index.keys());
            for (let i = 0, l = keys.length; i<l; i++)
            {
                if (val.test(keys[i]))
                {
                    instances = typeInfos.uniques[i] ? [index[j]]:Array.from(index[i]);
                    break;
                }
            }
        }
        else
        {
            val = String(val);
            instances = typeInfos.uniques[i] ? [index.get(val)]:index.get(val);
        }
        if (instances)
        {
            if (first)
            {
                results = instances;
                first = false;
            }
            else
            {
                results = new Set (instances.filter(x => results.has(x)));
            }
        }
    }
    return Array.from(results);
}

function getOneBy (type, search)
{
    return getBy(type, search)[0];
}

function getOneByOrCreate (type, search, data)
{
    let instance = getOneBy(type, search);
    if (instance) return instance;

    instance = get(type, Object.assign(data, search));
    return instance;
}

function getType (type)
{
    if (typeof type === 'function')
    {
        if (cache.has(type.name)) return type;
    }
    else
    {
        type = cache.get(type);
        if (type) return type.constructor;
    }

    return false;
}

function getTypeInfos (type)
{
    if (typeof type === 'function') type = type.name;

    type = cache.get(type);
    if (type) return type;

    return false;
}

function hasIndex (type, index)
{
    return cache.get(type).indices.has(index);
}

function register (constructor, indices = [])
{
    let typeInfos = {
        constructor
	,	name: constructor.name
	,   indices: new Map()
	,	cache: new Map()
    };

    cache.set(constructor.name, typeInfos);

    if (indices.length)
	{
		typeInfos.indices = new Map();
		for (let i = 0, l = indices.length; i<l; i++)
		{
			typeInfos.indices.set(indices[i], new Map());
		}
	}

    console.log ('Model : ' + typeInfos.name + ' is registered for cache');
}

function remove (instance)
{
    let typeInfos = cache.get(instance.__static.name);
    let id = String(instance._id);

    if (!typeInfos.cache.has[id]) return;

    typeInfos.indices.forEach((index, key) => {
        let val = String(instance[key]);
        if (typeInfos.uniques[key]) index.delete(val);
        else if (index.has(val))
        {
            index.get(val).delete(instance);
        }
    });

    typeInfos.cache.delete(id);
}

function updateIndex(instance, field, newValue, oldValue)
{
	let typeInfos = cache.get(instance.__static.name);
    let index = typeInfos.indices.get(field);
    if (typeInfos.uniques[field])
    {
        if (index.has(newValue)) return false;
        if (typeof oldValue !== 'undefined') index.delete(oldValue);
        index.set(newValue, instance);
    }
    else
    {
        if (typeof oldValue !== 'undefined')
        {
            let instances = index.get(oldValue);
            if (instances)
            {
                index.delete(instance);
                if (instances.size === 0) index.delete(oldValue);
            }
        }
        let instances = index.get(newValue);
        if (!instances) index.set(newValue, instances = new Set());
        instances.add(instance);
    }
	return true;
}

function isRegistered (type)
{
	return cache.has(type);
}