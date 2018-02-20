"use strict";
const helpers = require ('./helpers');

function DynamixCollection (parent, path, virtual, inheritedParent, inheritedOwner, type, sortBy, ascendant)
{
    const arr = [];
    arr.__proto__ = DynamixCollection.prototype;
    arr.list = {};
    arr.path = path;
    arr.parent = parent;
    arr.inheritedParent = inheritedParent;
    arr.inheritedOwner = inheritedOwner;
    arr._persistent = !virtual;
    // arr.persistentPath = path+'_ids';
    // arr.compare = DynamixCollection.prototype.compare.bind(arr);
    arr._autoRemove = DynamixCollection.prototype._autoRemove.bind(arr);
    arr._sorting = opts.sortOn ? compileSortByParams (opts.sortOn) : null;
    arr.refs = {};
    return arr;
}

/*!
 * Inherit from Array
 */
var _super = new Array;
DynamixCollection.prototype = _super;

exports = module.exports = DynamixCollection;

DynamixCollection.prototype.sortOn = function (sortOn)
{
    if (!sortOn)
    {
        this._sorting = null;
        return;
    }
    this._sorting = compileSortByParams (opts.sortOn);
    this.sort(this.compare);

    if (this.persistent)
    {
        this.store.length = 0;
        for (let i = 0, l = this.length; i<l; i++)
        {
            this.store[i] = getMongooseRef(this[i]);
        }
        this.parent.save(this.path);
    }
};

DynamixCollection.prototype.contains = function(instance, type)
{
    return this.list.hasOwnProperty(getId(this, instance, type));
};

DynamixCollection.prototype.search = function (search)
{
    for (let prop in search)
    {
        for (let i in this.list)
        {
            if (this.list[i][prop] === search[prop]) return this.list[i];
        }
    }
    return false;
};

DynamixCollection.prototype.getById = function (id, type)
{
    return this.list[getId(this, id, type)];
};

DynamixCollection.prototype.first = function ()
{
    return this[0];
};

DynamixCollection.prototype.last = function ()
{
    return this[this.length-1];
};

DynamixCollection.prototype.setAll = function (instances, socket)
{
    let transfered = new Set();
    for (let i in this.list)
    {
        let instance = this.list[i];
        let removed = instances.indexOf(instance) === -1;
        if (removed)
        {
            this.emit('item-removed', instance);
            instance.removeListener('destroy', this._autoRemove);
        }
        else
        {
            transfered.add(instance);
        }
    }

    this.length = 0;
    for (let i in this.list)
    {
        delete this.list[i];
    }

    for (let i = 0, l = instances.length; i<l; i++)
    {
        let instance = instances[i];
        if (!isAllowedType(this, instance)) continue;
        this.insert(instance, null, false, !!transfered[instance._id]);
    }

    if (this.persistent && this.parent.initialized)
    {
        for (let i in this.list)
        {
            let instance = this.list[i];
            let id = this._idFromInstance(instance);
            this.ids[id] = {id: instance._id, type: instance.__static.name};
        }
        this.parent.model[this.persistentPath] = this.getIds();
        this.parent.save(this.persistentPath);
    }
    return true;
};

DynamixCollection.prototype.add = function (instances)
{
    if (this.contains(instance)) return;
    return this.insert(instances).insertedIndex;
};

DynamixCollection.prototype.insert = function (instances, index = null)
{
    instances = instances.filter((instance) => !instance.destroyed);

    let l = instances.length;

    if (!this._sorting)
    {
        index = index === null || isNaN(index) || index < 0 ? this.length:index;
        let target = this[index-1];
        for (let i = 0; i<l; i++)
        {
            let id = getId(this, instances[i]);
            let instance = this.list[id];
            if (instance)
            {
                let instanceIndex = this.indexOf(instance);
                this.splice(instanceIndex, 1);
                instances[i] = instance;
                if (instance === target) target = this[instanceIndex];
            }
        }

        if (index < this.length) index = this.indexOf(target)+1;

        for (let i = 0; i<l; i++)
        {
            let instance = instances[i];
            instance.splice(index, 0, ...instances);
        }
    }
    else
    {
        for (let i = 0; i<l; i++)
        {
            let instance = instances[i];
            let index = 0;
            while (index<this.length && this.compare(this, instance, this[index])>0)
            {
                index++;
            }
            this.splice(index, 0, instance);
        }
    }

    for (let i = 0; i<l; i++)
    {
        let instance = instances[i];
        let id = getId(this, instance);

        if (this.list[id]) continue;

        this.list[id] = instance;
        instance.once('destroy', this._autoRemove);
        if (this.inheritParent) instance.parent = this.parent;
        this.emit('item-inserted', instance);
    }
};



DynamixCollection.prototype.r_move = function (id, type, from, to, feedback, socket)
{
    type = cache.getType(type) || this.type;
    if (!type) return;
    return type.getById(id)
    .bind(this)
    .then(function(instance)
    {
        return this.move(instance, from, to, feedback ? false:socket);
    })
    .catch(function (e)
    {
        console.error(e);
    });
};

DynamixCollection.prototype.move = function (instance, from, to, socket)
{
    if (this.typeName && instance.__static.name !== this.typeName) return -1;
    if (this._move(instance, from, to))
    {
        this._remoteExecute('move', socket, instance, from, to);
        if (this.persistent)
        {
            this.parent.model[this.persistentPath].splice(to, 0, this.parent.model[this.persistentPath].splice(from, 1)[0]);
            this.parent.save(this.persistentPath);
        }
        return true;
    }
    return false;
};

DynamixCollection.prototype._move = function (instance, from, to)
{
    if (this._sorting) return false;
    if (to > this.length-1 || from < 0) return false;
    if (this.indexOf(instance) !== from) return false;

    this.splice(to, 0, this.splice(from, 1)[0]);
    return true;
};

DynamixCollection.prototype.r_remove = function (id, type, feedback, socket)
{
    type = cache.getType(type) || this.type;
    if (!type) return;
    var instance = this.getById(id, type);
    if (instance) return this._remove(instance, feedback ? false:socket);
};

DynamixCollection.prototype.remove = function (instance, socket)
{
    let idx = this._remove(instance);
    if (idx > -1)
    {
        this._remoteExecute('remove', socket || false, instance);
        if (this.persistent)
        {
            delete this.ids[this._idFromInstance(instance)];
            this.parent.model[this.persistentPath].splice(idx, 1);
            this.parent.save(this.persistentPath);
        }
        return true;
    }
    return false;
};

DynamixCollection.prototype._remove = function (instance)
{
    if (!this.contains(instance))
    {
        console.log('cannot remove instance from '+ instance._id +' collection ');
        return false;
    }
    var id = this._idFromInstance(instance);
    delete this.list[id];
    let idx = -1;
    for(let i = 0, l = this.length; i<l; i++)
    {
        if (this[i] && this[i]._id == instance._id && this[i].__static.name == instance.__static.name)
        {
            this[i].removeListener('destroy', this._autoRemove);
            this.splice(i,1);
            idx = i;
            if (this.onRemoved) this.onRemoved(instance);
            break;
        }
    }
    return idx;
};

DynamixCollection.prototype._autoRemove = function (instance)
{
    console.log('try auto remove instance '+ instance._id);
    this.remove(instance);
};

DynamixCollection.prototype.r_clear = function (destroyAll)
{
    this._clear(destroyAll);
    if (!destroyAll) this.parent.remoteExecute(this.path, false, 'clear');
};

DynamixCollection.prototype.clear = function (destroyAll)
{
    this._clear(destroyAll);
    if (!destroyAll) this.parent.remoteExecute(this.path, false, 'clear');
};

DynamixCollection.prototype._clear = function (destroyAll)
{
    for (var i in this.list)
    {
        if (!destroyAll && this.onRemoved) this.onRemoved(this.list[i]);
        this.list[i].removeListener('destroy', this._autoRemove);
    }
    if (destroyAll)
    {
        for (var i in this.list)
        {
            this.list[i].destroy();
        }
    }
    this.length = 0;
    for (var i in this.list)
    {
        delete this.list[i];
    }
    if (this.persistent)
    {
        this.ids = {};
        this.parent[this.persistentPath] = [];
        this.parent.save(this.persistentPath);
    }
};

DynamixCollection.prototype.toMongoose = function ()
{
    return this.map(getMongooseRef);
};

DynamixCollection.prototype.compare = function (a, b)
{
    for (let i in this._sorting)
    {
        let ascendant = !!this._sorting[i];
        a = helpers.pathValue (i, a);
        b = helpers.pathValue (i, b);
        if (typeof a === 'string')
        {
            switch (a.localeCompare (b))
            {
                case 1:
                    return ascendant ? 1:-1;
                case -1:
                    return ascendant ? -1:1;
            }
        }
        else
        {
            if (b>a)
                return ascendant ? -1:1;
            if (a>b)
                return ascendant ? 1:-1;
        }
    }
    return 0;
};

function compileSortByParams (params)
{
    let result = {};
    if (typeof params === 'string')
    {
        sortBy.split(' ').forEach((param) =>
        {
            const [field, ascendant] = parseSortByParam(param);
            result[field] = ascendant;
        });
    }
    else if (Array.isArray(params))
    {
        params.forEach((param) => {
            if (typeof param !== 'string') return;
            const [field, ascendant] = parseSortByParam(param);
            result[field] = ascendant;
        })
    }
    else if (params && typeof params === 'object' && !Array.isArray(params))
    {
        for (let i in params)
        {
            if (typeof params[i] !== 'boolean') continue;
            result[i] = params[i];
        }
    }
    return result;
}


function getId (context, instance, type)
{
    if (instance)
    {
        if (typeof instance === 'object' && instance.__static)
        {
            return instance.__static.name + instance._id;
        }
        else
        {
            if (!type) type = context.defaultType.name;
            return type+instance
        }
    }
    return false;
}

function parseSortByParam (param)
{
    if (param.startsWith('>')) return [param, false];
    else return [param, true];
}

//TODO put it in one place
function getMongooseRef (obj)
{
    if (!obj) return null;
    return {item: obj._id, itemType: obj.__static.name};
}

DynamixCollection.prototype._remoteExecute = function (action, socket)
{
    Remote.executeCollectionMethod.apply (Remote, [this.parent, this.path, action, socket].concat(Array.prototype.slice.call(arguments, 2)));
};