;define
([
    './remote-module'
,   'tt/core/util'
]
,
function (module)
{
    module
	.factory('RemotedCollection', ['util', 'remoteCache',  function(util, remoteCache)
	{
		'use strict';
		function RemotedCollection (parent, path, type, sortBy, ascendant)
		{
			var arr = [];
			arr.__proto__ = RemotedCollection.prototype;
			arr.list = {};
			arr.path = path;
			arr.parent = parent;
            arr.type = typeof type === 'string' ? remoteCache.getType(type):type;
			arr._autoRemove = RemotedCollection.prototype._autoRemove.bind(arr);
			arr._sorting = arr._compileSortByParam (sortBy, ascendant) || {"_id": (ascendant !== undefined ? (ascendant ? true:false):true)};
            arr.list = {};
            arr.compare = RemotedCollection.prototype.compare.bind (arr);
            return arr;
        }

        RemotedCollection.prototype = new Array;

		RemotedCollection.prototype.sortOn = function(sorting, ascendant)
		{
			this._sorting = this._compileSortByParam (sorting, ascendant);
			this.sort(this.compare);
		};

        RemotedCollection.prototype.contains = function(instance)
		{
			return this.list.hasOwnProperty(instance._id);
		};

        RemotedCollection.prototype.getById = function (id)
		{
			return this.list[id];
		};

        RemotedCollection.prototype.first = function ()
		{
			return this[0];
		};

        RemotedCollection.prototype.last = function ()
		{
			return this[this.length-1];
		};

		RemotedCollection.prototype.add = function (instance, addImmediate)
		{
			if (addImmediate && this._add(instance) > -1)
			{
				this.parent.remoteExecute(this.path, false, 'add', instance instanceof this.type ? instance._id:instance);
			}
			else if (!addImmediate)
			{
				this.parent.remoteExecute(this.path, false, 'add', instance instanceof this.type ? instance._id:instance);
			}
		};

        RemotedCollection.prototype.r_add = function (data)
        {
            var instance = remoteCache.get(this.type, data);
            if (instance && this._add(instance) > -1)
            {
                this.parent.dirty();
            }
        };

        RemotedCollection.prototype._add = function (instance)
		{
			if (this.list.hasOwnProperty(instance._id)) return -1;
			return this._replace (instance);
		};

        RemotedCollection.prototype.r_replace = function (data)
        {
            var instance = remoteCache.get(this.type, data);
            if (instance && this._replace(instance) > -1)
            {
                this.parent.dirty();
            }
        };

        RemotedCollection.prototype._replace = function (instance)
		{
			if (this.list.hasOwnProperty(instance._id))
			{
				delete this.list[instance._id];
			}
			var i = 0;
			while (i<this.length && this.compare(instance, this[i])>0)
			{
                i++;
			}
			this.splice(i,0,instance);
			this.list[instance._id] = instance;
			if (typeof this.onAdded === 'function') this.onAdded.call(this, instance);
			instance.once('destroy', this._autoRemove);
			return i;
		};

        RemotedCollection.prototype.remove = function (data)
        {
            var instance = this.getById(data._id);
            if (instance && this._remove(instance))
            {
                this.parent.remoteExecute(this.path, false, 'remove', instance._id);
            }
        };

        RemotedCollection.prototype.r_remove = function (data)
        {
            if (typeof data !== 'object') return;
            var instance = this.getById(data._id);
            if (instance && this._remove(instance))
            {
                this.parent.dirty();
            }
        };

		RemotedCollection.prototype._remove = function (instance)
		{
			if (!this.list.hasOwnProperty(instance._id)) return false;
			delete this.list[instance._id];
            for(var i = 0, l = this.length; i<l; i++)
            {
                if (this[i]._id == instance._id)
                {
                    this.splice(i,1);
					if (typeof this.onRemoved === 'function') this.onRemoved.call(this, instance);
                    break;
                }
            }
            return true;
		};

		RemotedCollection.prototype.sync = function (data)
		{
			if (!angular.isArray(data)) return false;
			var newInstances = [];
			var instance;
			var toRemove = angular.copy(this.list);

			for (var i = 0, l = data.length; i<l; i++)
			{
				if (!(data[i] instanceof this.type))
				{
					instance = remoteCache.get(this.type, data[i]);
					if (!instance) continue;
				}
				else instance = data[i];

				if (!this.contains(instance))
				{
					newInstances.push (instance);
				}
				else
				{
					instance.update(data[i]);
				}
				delete toRemove[instance._id];
			}
			for (var i in toRemove)
			{
				this.remove(toRemove[i]);
			}
			for (var i = 0, l = newInstances.length; i<l; i++)
			{
				this.add (newInstances[i]);
			}
		};

		RemotedCollection.prototype._sync = function (data, circularMap)
        {
            if (!angular.isArray(data)) return false;
            var newInstances = [];
            var instance;
            var toRemove = angular.copy(this.list);
            var dirty = false;

            for (var i = 0, l = data.length; i<l; i++)
            {
                if (!(data[i] instanceof this.type))
                {
                    instance = remoteCache.get(this.type, data[i], circularMap);
                    if (!instance) continue;
                }
                else instance = data[i];

                if (!this.contains(instance))
                {
                    newInstances.push (instance);
                }
				else if (circularMap)
				{
					if (!circularMap.hasOwnProperty(this.type.remotedName+instance._id))
					{
						circularMap[this.type.remotedName+instance._id] = true;
						instance.update(data[i], null, circularMap);
					}
				}
				else 
				{
					instance.update(data[i]);
				}
                delete toRemove[instance._id];
            }
            for (var i in toRemove)
            {
                dirty = true;
                this._remove(toRemove[i]);
            }
            if (newInstances.length > 0) dirty = true;
            for (var i = 0, l = newInstances.length; i<l; i++)
            {
                this._add (newInstances[i]);
            }
            return dirty;
        };

        RemotedCollection.prototype._autoRemove = function (instance)
        {
            this.r_remove(instance);
        };

		RemotedCollection.prototype.r_clear = function ()
		{
			this._clear();
			this.parent.dirty();
		};

		RemotedCollection.prototype.clear = function ()
		{
			this._clear();
			this.parent.remoteExecute(this.path, false, 'clear');
		};

		RemotedCollection.prototype._clear = function ()
		{
			var clearedList = this.list;
			this.length = 0;
			for (var i in this.list)
			{
				delete this.list[i];
			}
            for (var i in clearedList)
            {
				clearedList[i].removeListener('destroy', this._autoRemove);
				if (typeof this.onRemoved === 'function') this.onRemoved.call(this, clearedList[i]);
            }
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
			if (typeof sortBy == 'string')
			{
				sortBy = sortBy.split (' ');
			}
			else if (!angular.isArray(sortBy))
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

		return RemotedCollection;
	}]);
});