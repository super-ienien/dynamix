"use strict";
const helpers = require ('./helpers');

const caches = new Map();
const types = new Map();

function remove(type, arg1)
{
    if (typeof type === 'function') type = type.name;
    if (type && typeof type === 'object')
    {
        arg1 = type;
        type = type.__static.name;
    }
    let cache = caches.get(type);
    if (!cache) return;

    let id;
    if (typeof arg1 === 'object')
    {
        id = (typeof arg1['_id'] !== "undefined") ? arg1._id:arg1;
    }
    else
    {
        id = arg1;
    }
    let idType = typeof id;
    if (idType === 'undefined') return;
    if (idType === 'object') id = id.toString();
    cache.delete(id);
}

function add (instance)
{
    const type = instance.__static.name;
    const cache = caches.get(type);
    if (!cache) return;

    let id = instance._id;
    const idType = typeof id;
    if (idType === 'undefined') return;
    if (idType === 'object') id = id.toString();
    if (cache.has(id))
    {
        console.error ('WARNING DUPLICATED OBJECT IN CACHE ' + id);
        return;
    }
    cache.add(id, instance);
}

function exists (type, arg1)
{
    if (typeof type === 'function') type = type.name;
    let cache = caches.get(type);
    if (!cache) return false;

    let id;
    if (typeof arg1 === 'object')
    {
        id = (typeof arg1['_id'] !== "undefined") ? arg1._id:arg1;
    }
    else
    {
        id = arg1;
    }
    let idType = typeof id;
    if (idType === 'undefined') return false;
    if (idType === 'object') id = id.toString();
    return cache.has(id)
}

function get (type, arg1)
{
    if (arguments.length === 1)
    {
        let parsed = helpers.parseDynamixId(type);
        if (!parsed) return null;
        type = parsed.type;
        arg1 = parsed.id
    }
    if (typeof type === 'function') type = type.name;
    let cache = caches.get(type);
    if (!cache) return null;

    let id;
    if (typeof arg1 === 'object')
    {
        id = (typeof arg1['_id'] !== "undefined") ? arg1._id:arg1;
    }
    else
    {
        id = arg1;
    }
    let idType = typeof id;
    if (idType === 'undefined') return null;
    if (idType === 'object') id = id.toString();
    return cache.get(id) || null;
}

function all (type)
{
    if (typeof type === 'function') type = type.name;
    let cache = caches.get(type);
    if (!cache) return [];
    return Array.from(cache.values());
}

function register (constructor)
{
    const type  = constructor.name;

    const typeDescriptor = {
        constructor
    ,   name: type
    };

    for (let i = 0, l = index.length; i<l; i++)
    {
        typeDescriptor.indices.add(index[i]);
    }

    types.set(type, typeDescriptor);
    caches.set(type, new Map());
}

function isRegistered(type)
{
    if (typeof type === 'function') type = type.name;
    return types.has(type);
}

function getType(type)
{
    if (types.has(type))
    {
        return types.get(type).constructor;
    }
    return false;
}

module.exports = {
    get
,   add
,   remove
,   all
,   exists
,   register
,   isRegistered
,   'caches': cache
};