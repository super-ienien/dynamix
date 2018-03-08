"use strict";

const Remote = require ('./remote');
const cache = require ('./cache');
const util = require ('../helpers/util');

function RemotedCollection (parent, prop)
{
    const arr = [];
    arr.__proto__ = RemotedCollection.prototype;
    arr.list = {};
    arr.path = prop.name;
    arr.parent = parent;
    arr.type = typeof prop.type === 'function' ? prop.type:null; // TODO gérer les types dynamiques
    arr.typeName= type ? type.name:'';
    arr.inheritedParent = prop.inheritedParent;
    arr.inheritedOwner = prop.inheritedOwner;
    arr.persistent = prop.persistent;
    arr.compare = RemotedCollection.prototype.compare.bind(arr);
    arr._autoRemove = RemotedCollection.prototype._autoRemove.bind(arr);
    arr._sorting = null;
    arr.ids = {};
    return arr;
}

/*!
 * Inherit from Array
 */
var _super = new Array;
RemotedCollection.prototype = _super;

exports = module.exports = RemotedCollection;

RemotedCollection.prototype.sortOn = function (sorting, ascendant)
{
    if (!sorting)
    {
        this._sorting = null;
        return;
    }
    this._sorting = this._compileSortByParam (sorting, ascendant);
    this.sort(this.compare);

    if (this.persistent)
    {
        let ids = this.parent.model[this.persistentPath];
        ids.length = 0;
        for (let i = 0, l = this.length; i<l; i++)
        {
            ids[i] = {id: this._idFromInstance(this[i]), type: this[i].__static.name};
        }
        this.parent.save(this.persistentPath);
    }
};

RemotedCollection.prototype.contains = function(instance, type)
{
    if (typeof instance === 'object')
    {
        return this.list.hasOwnProperty(this._idFromInstance(instance));
    }
    else
    {
        if (this.type) return this.list.hasOwnProperty(instance);
        else if (type) return this.list.hasOwnProperty(type+instance);
    }
    return false;
};

RemotedCollection.prototype.search = function (search)
{
    for (var prop in search)
    {
        for (var i in this.list)
        {
            if (this.list[i][prop] === search[prop]) return true;
        }
    }
};

RemotedCollection.prototype.getById = function (id, type)
{
    if (this.type) return this.list[id];
    else if (type) return this.list[type+id];
};

RemotedCollection.prototype.get = function (instance, type) /** TODO Check if it's used **/
{
    console.log ('------------------------------YYEAHHHHHH ITS USED !!!!!!!!!!!!');
    if (typeof instance === 'object')
    {
        this.list[this._idFromInstance(instance)];
    }
    else
    {
        return this.getById(instance, type);
    }
};

RemotedCollection.prototype.first = function ()
{
    return this[0];
};

RemotedCollection.prototype.last = function ()
{
    return this[this.length-1];
};


RemotedCollection.prototype.r_set = function (ids, feedback, socket)
{
    Promise.map(ids, (id) =>
    {
        switch (typeof id)
        {
            case 'object':
                id.type = cache.getType(id.type);
            break;
            default:
                if (!this.type) throw "id with no specified type";
                id = {id, type: this.type}
        }
        return id.type.getById(id.id);
    })
    .then((instances) =>
    {
        this.set(instances, feedback ? false:socket);
    });
};

RemotedCollection.prototype.set = function (instances, socket)
{
    this._set(instances);
    this._remoteExecute('set', socket || false, instances);
    if (this.persistent)
    {

        if (this.persistent)
        {
            this.ids = {};
            this.parent[this.persistentPath] = [];
            this.parent.save(this.persistentPath);
        }

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

RemotedCollection.prototype._set = function (instances)
{
    let muted = {};
    for (let i in this.list)
    {
        let instance = this.list[i];
        let removed = true;
        for (let i = 0, l = instances.length; i<l; i++)
        {
            if (instances[i]._id == instance._id)
            {
                removed = false;
                break;
            }
        }
        if (removed)
        {
            if (this.onRemoved) this.onRemoved(this.list[i]);
            instance.removeListener('destroy', this._autoRemove);
        }
        else
        {
            muted[instance._id] = true;
        }
    }

    this.length = 0;
    for (var i in this.list)
    {
        delete this.list[i];
    }

    for (let i = 0, l = instances.length; i<l; i++)
    {
        let instance = instances[i];
        if (this.typeName && instance.__static.name !== this.typeName) continue;
        this._insert(instance, null, false, !!muted[instance._id]);
    }
};

RemotedCollection.prototype.r_add = function (id, type, feedback, socket)
{
    type = cache.getType(type) || this.type;
    if (!type) return;
    return type.getById(id)
    .bind(this)
    .then(function(instance)
    {
        this.add(instance, feedback ? false:socket);
    })
    .catch(function (e)
    {
        console.error(e);
    });
};

RemotedCollection.prototype.add = function (instance, socket)
{
    if (this.typeName && instance.__static.name !== this.typeName) return false;
    let index = this._add(instance);
    if (index > -1)
    {
        this._remoteExecute('add', socket || false, instance);
        if (this.persistent)
        {
            let id = this._idFromInstance(instance);
            this.ids[id] = {id: instance._id, type: instance.__static.name};
            this.parent.model[this.persistentPath].splice(index, 0, this.ids[id]);
            this.parent.save(this.persistentPath);
        }
        return true;
    }
    return false;
};

RemotedCollection.prototype._add = function (instance)
{
    if (this.contains(instance)) return -1;
    return this._insert(instance).insertedIndex;
};

RemotedCollection.prototype.r_insert = function (id, type, index, feedback, socket)
{
    type = cache.getType(type) || this.type;
    if (!type) return;
    return type.getById(id)
    .bind(this)
    .then(function(instance)
    {
        this.insert(instance, index, false, feedback ? false:socket);
    })
    .catch(function (e)
    {
        console.error(e);
    });
};

RemotedCollection.prototype.insert = function (instance, index, replace, socket)
{
    if (this.typeName && instance.__static.name !== this.typeName) return -1;
    let ret = this._insert(instance, index);
    if (ret.insertedIndex > -1)
    {
        this._remoteExecute('insert', socket, instance, index, replace);
        if (this.persistent)
        {
            this.ids[ret.id] = {id: instance._id, type: instance.__static.name};
            if (ret.removed) delete this.ids[ret.removed.__static.name+ret.removed._id];
            if (ret.replaced) delete this.ids[ret.replaced.__static.name+ret.replaced._id];
            if (ret.removedIndex > -1) this.parent.model[this.persistentPath].splice(ret.removedIndex, 1);
            if (ret.replacedIndex > -1) this.parent.model[this.persistentPath].splice(ret.replacedIndex, 1);
            this.parent.model[this.persistentPath].splice(ret.insertedIndex, 0, this.ids[ret.id]);
            this.parent.save(this.persistentPath);
        }
        return ret.insertedIndex;
    }
    return -1;
};

RemotedCollection.prototype._insert = function (instance, index, replace, mute)
{
    if (instance.destroyed)
    {
        console.warn('instance was not added to collection beacause it was already destroyed');
        return -1;
    }
    var ret = {
        removedIndex: -1
    ,   replacedIndex: -1
    ,   insertedIndex: -1
    ,   replaced: null
    ,   removed: null
    ,   id: this._idFromInstance(instance)
    };

    if (this.list.hasOwnProperty(ret.id))
    {
        ret.removedIndex= this.indexOf(this.list[ret.id]);
        if (ret.removedIndex > -1) ret.deleted = this.splice(ret.removedIndex, 1)[0];
        index = index === null || isNaN(index) || index < 0 ? (ret.removedIndex > -1 ? ret.removedIndex:this.length):(ret.removedIndex > index ? index:index-1);
    }
    else
    {
        index = index === null || isNaN(index) || index < 0 ? this.length:index;
    }

    if (this._sorting)
    {
        if (replace && index<this.length)
        {
            ret.replacedIndex = index;
            ret.replaced = this.splice(ret.replacedIndex, 1)[0];
        }
        index = 0;
        while (index<this.length && this.compare(instance, this[index])>0)
        {
            index++;
        }
        this.splice(index, 0, instance);
    }
    else if (index >= this.length)
    {
        this[index] = instance;
    }
    else if (replace && index>-1)
    {
        ret.replacedIndex = index;
        ret.replaced = this.splice(ret.replacedIndex, 1, instance)[0];
    }
    else
    {
        this.splice(index, 0, instance);
    }
    ret.insertedIndex = index;
    this.list[ret.id] = instance;
    if (ret.deleted !== instance && ret.replaced !== instance && !mute)
    {
        instance.once('destroy', this._autoRemove);
        if (this.inheritedParent) instance.parent = this.parent;
        if (this.inheritedOwner) instance.chown(this.parent.owner());
        if (this.onAdded) this.onAdded(instance);
        for (var i in this.parent._remoteSockets)
        {
            this.parent._remoteSockets[i].registerInstance(instance);
        }
    }
    return ret;
};


RemotedCollection.prototype.r_move = function (id, type, from, to, feedback, socket)
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

RemotedCollection.prototype.move = function (instance, from, to, socket)
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

RemotedCollection.prototype._move = function (instance, from, to)
{
    if (this._sorting) return false;
    if (to > this.length-1 || from < 0) return false;
    if (this.indexOf(instance) !== from) return false;

    this.splice(to, 0, this.splice(from, 1)[0]);
    return true;
};

RemotedCollection.prototype.r_remove = function (id, type, feedback, socket)
{
    type = cache.getType(type) || this.type;
    if (!type) return;
    var instance = this.getById(id, type);
    if (instance) return this._remove(instance, feedback ? false:socket);
};

RemotedCollection.prototype.remove = function (instance, socket)
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

RemotedCollection.prototype._remove = function (instance)
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

RemotedCollection.prototype._autoRemove = function (instance)
{
    console.log('try auto remove instance '+ instance._id);
    this.remove(instance);
};

RemotedCollection.prototype.r_clear = function (destroyAll)
{
    this._clear(destroyAll);
    if (!destroyAll) this.parent.remoteExecute(this.path, false, 'clear');
};

RemotedCollection.prototype.clear = function (destroyAll)
{
    this._clear(destroyAll);
    if (!destroyAll) this.parent.remoteExecute(this.path, false, 'clear');
};

RemotedCollection.prototype._clear = function (destroyAll)
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

RemotedCollection.prototype._idFromInstance = function (instance)
{
    return this.type ? instance._id:instance.__static.name+instance._id;
};

RemotedCollection.prototype.getIds = function ()
{
    var ids = [];
    for (var i = 0, l = this.length; i<l; i++)
    {
        ids.push({id: this[i]._id, type: this[i].__static.name});
    }
    return ids;
};


RemotedCollection.prototype.compare = function (a, b)
{
    for (var i in this._sorting)
    {
        a = util.pathValue (i, a);
        b = util.pathValue (i, b);
        if (typeof a === 'string')
        {
            switch (a.localeCompare (b))
            {
                case 1:
                    return this._sorting[i] ? 1:-1;
                case -1:
                    return this._sorting[i] ? -1:1;
            }
        }
        else
        {
            if (b>a)
                return this._sorting[i] ? -1:1;
            if (a>b)
                return this._sorting[i] ? 1:-1;
        }
    }
    return 0;
};

RemotedCollection.prototype._compileSortByParam = function (sortBy, ascendant)
{
    var p;
    if (typeof sortBy === 'string')
    {
        sortBy = sortBy.split (' ');
    }
    else if (sortBy && typeof sortBy === 'object' && !Array.isArray(sortBy))
    {
        return sortBy;
    }
    ascendant = ascendant !== undefined ? (ascendant ? true:false):true;
    p = {};
    for (var i = 0, l = sortBy.length; i<l; i++)
    {
        p[sortBy[i]] = ascendant;
    }
    return p;
};

RemotedCollection.prototype._remoteExecute = function (action, socket)
{
    Remote.executeCollectionMethod.apply (Remote, [this.parent, this.path, action, socket].concat(Array.prototype.slice.call(arguments, 2)));
};