define (
[
    './remote-module'
]
,
function (module)
{
	module

	.factory ('remoteCache', ['util', function (util)
	{
		'use strict';
		var _idProperty = '_id';
		
		var _socket;
		
		var _cache = {};	
		var _types = {};
		
		var watcher = util.getEventEmitter();

		var _remove = function (type, object)
		{
			if (!_cache.hasOwnProperty (type)) return;
			if (!_cache[type].hasOwnProperty(object[_idProperty])) return;
			delete _cache[type][object[_idProperty]];
		};;
		
		var exists = function (type, arg1)
		{
			if (!_cache.hasOwnProperty (type)) return false;
			var id;
			if (arg1 && typeof arg1 === 'object')
			{
				id = arg1[_idProperty];
			}
			else
			{
				id = arg1;
			}
			if (id != undefined && _cache[type].hasOwnProperty(id))
			{
				return _cache[type][id];
			}
			return false;
		};
		
		var get = function (type, arg1, arg2, arg3)
		{
            if (typeof type === 'function') type = type.name;
			if (!_types.hasOwnProperty(type))
			{
				throw Error ("Cache Unknown Type : "+type);
			}
			var self = this;
			var data;
			var id;
			var instance;
			var circularMap;

			if (typeof arg1 == 'object')
			{
				if (!arg1.hasOwnProperty (_idProperty)) return;
				data = arg1;
				id = arg1[_idProperty];
				circularMap = arg2;
			}
			else
			{
				id = arg1;
				data = arg2;
				circularMap = arg3;
			}
			if (id != undefined && _cache[type][id] != undefined)
			{
				if (data) _cache[type][id].update(data);
				return _cache[type][id];
			}
			_cache[type][id] = new _types[type]();
			_cache[type][id]['__'+_idProperty+'__'] = id;
			_cache[type][id].on ('destroy', function () { _remove(type, this); });
			_cache[type][id].update(data, null, circularMap);
			watcher.emit ('new', _cache[type][id], type);
			return _cache[type][id];
		};
		
		var all = function (type)
		{
			if (_cache.hasOwnProperty(type)) return _cache[type];
			else return {};
		};
		
		var register = function (constructor)
		{
			var type  = constructor.remotedName || util.getFunctionName(constructor);
			_types[type] = constructor;
			_cache[type] = {};
		};
		
		var isRegistered = function (type)
		{
			return _cache.hasOwnProperty(type);
		};

        var getType = function (type)
        {
            return _types[type];
        };

		var idOf = function (data)
		{
			return data[_idProperty];
		};
		
		return {
			'get': get
		,   'all': all
		,   'exists': exists
		,   'register': register
		,   'isRegistered': isRegistered
		,   'idOf': idOf
		,   'watcher': watcher
		,   'getType': getType
        }
	}]);
});