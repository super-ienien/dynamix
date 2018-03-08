define (
[
	'./remote-module'
,   './remoted-collection'
]
,
function (module)
{
	'use strict';
	
	function Remoted ()
	{
		Remoted.__super.call(this, Remoted.eventEmitterConf);
		this.__destroyed = false;
		Remoted.__createRemotedCollections(this);
	}
	var RemotedConstructor = Remoted;
	
	module
	.factory ('Remoted', ['util', 'remoteCache', 'remoteService', 'RemotedCollection', function (util, remoteCache, remoteService, RemotedCollection)
	{
		var Remoted = RemotedConstructor;
		util.asEventEmitter (Remoted);
		
		Remoted.eventEmitterConf = {
			maxListeners: 100
		};
		
		Remoted.prototype.dirty = function ()
		{
			this.emit('dirty');
		};
		
		Remoted.prototype.update = function (data, local, circularMap)
		{
			if (!data) return;
			console.log ('update datas :');
			console.log (data);
			var dirty = false;
			var fields = [];
			var instance;
			var val;
			var oVal;
			var nVal;
			var prop;
			circularMap = circularMap || {};
			var idCircular = this.__static.remotedName+(this._id || data._id);
			if (circularMap.hasOwnProperty(idCircular)) return;
			circularMap[idCircular] = true;

			for (var i in data)
			{
				val = data[i];
				if (typeof val === 'undefined') continue;
				if (!this.__map.hasOwnProperty (i))
				{
					if (!this.__reverseMap.hasOwnProperty(i)) continue;
					prop = this.__reverseMap[i];
				}
				else
				{
					prop = this.__map[i];
				}
				
				fields.push (prop.name);
				
				switch (prop.type)
				{
					case 'property':
						if (prop.instanceOf != undefined && !(val instanceof prop.instanceOf)) val = new prop.instanceOf(val);
						oVal = this['__'+prop.name+'__'];
						this['r_'+prop.name] = val;
						nVal = this['__'+prop.name+'__'];
						if (!dirty && !angular.equals (oVal, nVal)) dirty = true;
					break;
					case 'function':
						dirty = true;
						this[prop.name](val);
					break;
					case 'mapped-object':
						if (prop.array)
						{
							if (!angular.isArray(this[prop.name]))
							{
								this[prop.name] = [];
								dirty = true;
							}
							for (var j = 0, l = val.length; j < l; j++)
							{
								if (typeof this[prop.name][j] !== 'object' || this[prop.name] === null) 
								{
									this[prop.name][j] = {};
									dirty = true;
								}
								if (_updateMappedObject (val[j], this[prop.name][j], prop.map, dirty)) dirty = true;
							}
						}
						else
						{
							if (typeof this[prop.name] !== 'object' || this[prop.name] === null) this[prop.name] = {};
							if (_updateMappedObject (val, this[prop.name], prop.map)) dirty = true;
						}
					break;
					case 'remoted':
						if (remoteCache.isRegistered (prop.instanceOf))
						{
							if (prop.array)
                            {
                                dirty = this[prop.name]._sync(val, circularMap) ? true: dirty;
                            }
                            else
                            {
								if (val)
                                {
                                    instance = remoteCache.exists(prop.instanceOf, val);
                                    if (instance)
                                    {
                                        if (val === instance)
                                        {
                                            dirty = true;
                                        }
                                        else if (!circularMap.hasOwnProperty(prop.instanceOf+instance._id))
										{
												circularMap[prop.instanceOf+instance._id] = true;
												dirty = instance.update(val, local, circularMap) ? true : dirty;
										}
                                    }
                                    else
                                    {
                                        instance = remoteCache.get(prop.instanceOf, val, circularMap);
                                        dirty = true;
                                    }
                                }
                                else
                                {
                                    instance = null;
                                }
                                if (this[prop.name] != instance)
                                {
                                    dirty = true;
                                    this[prop.name] = instance;
                                }
                            }
						}
					break;
				}
			}
			console.debug ('update of '+this.__static.remotedName+' '+this._id+(dirty ? ' : OK': ' : NO CHANGE'));
			if (dirty)
			{
				if (!local)
				{
					this.emit('dirty');
					return dirty;
				}
				else
				{
					return this.remoteUpdate (fields, true);
				}
			}
			else
			{
				if (!local)
				{
					return dirty;
				}
				else
				{
					return Promise.resolve();
				}
			}
		};
		
		function _updateMappedObject (data, object, map, dirty)
		{
			var prop;
			var val;
			if (typeof data !== 'object')
			{
				data = {};
				dirty = true;
			}
			for (var i in data)
			{
				prop = map[i];
				val = data[i];
				switch (map[i].type)
				{
					case 'property':
						if (!dirty && !angular.equals (object[prop.name], val)) dirty = true;
						object[prop.name] = val;
					break;
					case 'mapped-object':
						if (prop.array)
						{
							if (!angular.isArray(this[prop.name]))
							{
								this[prop.name] = [];
								dirty = true;
							}
							for (var j = 0, l = val.length; j < l; j++)
							{
								if (typeof this[prop.name][j] !== 'object' || this[prop.name] === null) 
								{
									this[prop.name][j] = {};
									dirty = true;
								}
								if (_updateMappedObject (val[j], this[prop.name][j], prop.map, dirty)) dirty = true;
							}
						}
						else
						{
							if (typeof this[prop.name] !== 'object' || this[prop.name] === null) this[prop.name] = {};
							if (_updateMappedObject (val, this[prop.name], prop.map)) dirty = true;
						}
						break;
				}
			}
			return dirty;
		}
		
		Remoted.prototype.remoteUpdate = function (fields, hasCallback)
		{			
			return remoteService.update (this, fields, hasCallback);
		};
		
		Remoted.prototype.remoteExecute = function (method, hasCallback)
		{
			return remoteService.execute.apply (remoteService, [this.__static.remotedName, remoteCache.idOf(this), method, hasCallback].concat (Array.prototype.slice.call(arguments, 2)));
		};
		
		Remoted.prototype.r_destroy = function ()
		{
			if (this.__destroyed) return;
			this.__destroyed = true;
			this.emit ('destroy', this);
			this.removeAllListeners();
			console.debug (this.__static.remotedName+' - id : '+this._id+' destroyed');
		};
		
		Remoted.prototype.destroy = function ()
		{
			return remoteService.destroy (this, true).bind(this).then (function ()
			{
				this.r_destroy();
			})
			.error(function(error)
			{
				console.debug("remote destroy failed");
				console.debug (error);
				console.debug (this);
			});
		};

		Remoted.prototype.toJSON = function (props, full)
		{
			full = typeof full === 'undefined' ? true:full;
			
			var map;
			if (typeof props == 'string') props = [props];
			if (angular.isArray(props))
			{
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
				map = this.__reverseMap;
			}
			return this.__static.toJSON (this, full, map);
		};
		
		Remoted.get = function (arg1, arg2)
		{
			return remoteCache.get (this.remotedName, arg1, arg2);
		};

		Remoted.exists= function (arg1)
		{
			return remoteCache.exists (this.remotedName, arg1);
		};

		Remoted.hook = function (name, fn)
		{
			this.prototype[name] = fn;
		};
		
		Remoted.register = function (name, constructor, map)
		{
			constructor.remotedName = name;
			this.inherits (constructor, map);
		};
		
		Remoted.inherits = function (constructor, map)
		{
			util.inherits (constructor, Remoted);
			remoteCache.register(constructor);
			constructor.setMap = function (map)
			{
				Remoted.setMap (constructor, map);
			};
			constructor.toJSON = Remoted.toJSON;
			constructor.hook = Remoted.hook;
			if (map)
			{
				constructor.setMap (map);
			}
			constructor.get = Remoted.get;
			constructor.exists = Remoted.exists;
			if (constructor.remotedName == undefined) constructor.remotedName = util.getFunctionName (constructor);
		};
		
		Remoted.toJSON = function (obj, full, map)
		{
			map = map ? map:this.prototype.__reverseMap;
			var json = {};
			var i;
			var prop;
			var val;
			
			if (typeof obj == 'function')
			{
				obj = obj();
			}
			if (typeof obj !== 'object') return json;
			for (i in map)
			{
				if (typeof obj[i] === 'undefined') continue;
				prop = map[i];
				switch (prop.type)
				{
					case 'property':
						json[prop.jsonName] = obj[i];
					break;
					case 'remoted':
                        if (prop.array)
                        {
                            json[prop.jsonName] = [];
                            for (var j = 0, l = obj[i].length; i<l; i++)
                            {
                                json[prop.jsonName][j] = full ? obj[i][j].toJSON():{'_id': obj[i][j]._id};
                            }
                            break;
                        }
                        else if (!full)
                        {
                            json[prop.jsonName] = {'_id': obj[i]._id};
                            break;
                        }
					case 'mapped-object':
						if (prop.hasOwnProperty ('reverseMap'))
						{
							if (prop.array)
							{
								json[prop.jsonName] = [];
								if (angular.isArray(obj[i]))
								{
									for (var j = 0, l = obj[i].length; i<l; i++)
									{
										json[prop.jsonName][j] = this.toJSON (obj[i][j], full, prop.reverseMap);
									}
								}
							}
							else
							{
								json[prop.jsonName] = this.toJSON (obj[i], full, prop.reverseMap);
							}
						}
						else if (prop.hasOwnProperty ('toJSON') && typeof obj[i][prop.toJSON] === 'function')
						{
							json[prop.jsonName] = obj[i][prop.toJSON]();
						}
					break;
				}
			}
			return json;
		};
		
		Remoted.setMap = function (constructor, map)
		{
			if (constructor.prototype.hasOwnProperty ('__map')) return;
			if (!map.hasOwnProperty ('_id')) map._id = ':';
			constructor.prototype.__map = {};
			constructor.prototype.__reverseMap = {};
			__buildMap (constructor, map, constructor.prototype.__map, constructor.prototype.__reverseMap);
			if (!map.hasOwnProperty('id'))
			{
				Object.defineProperty(constructor.prototype, 'id', {
					get: function ()
					{
						return this._id;
					}
				});
			}
			console.debug ("BUILD MAP FOR '"+constructor.remotedName+"'");
			console.debug (constructor.prototype.__map);
		};

		function __buildMap (constructor, map, buildMap, buildReverseMap)
		{
			if (typeof map != 'object') return buildMap;
			constructor.prototype.__remotedCollectionProps = {};
			constructor.prototype.__remotedProps = {};
			var prop;
			var opts;
			var buildProp;
			var isArray;
			var defaultOpts = 
			{
				toJSON: 'toJSON'
			};
			for (var i in map)
			{
				if (i == 'remoteMethods')
				{
					prop = map[i];
					for (var j = 0, l = prop.length; j<l; j++)
					{
						Remoted.__createRemoteMethod (constructor, prop[j]);
					}
					continue;
				}
				if (i == 'remoteStaticMethods')
				{
					prop = map[i];
					for (var j = 0, l = prop.length; j<l; j++)
					{
						Remoted.__createRemoteStaticMethod (constructor, prop[j]);
					}
					continue;
				}
				isArray = false;
				if (!angular.isArray(map[i])) map[i] = [map[i]];
				else if (angular.isArray (map[i][0]))
				{
					isArray = true;
					map[i][0] = map[i][0][0];
				}
				prop = map[i][0];
				opts = angular.extend (map[i][1] || {}, defaultOpts);
				buildProp = {};
				switch (typeof prop)
				{
					case 'boolean' :
						if (prop)
						{
							buildProp.name = i;
							buildProp.type = 'property';
						}
					break;
					case 'string':
						if (prop.startsWith(':'))
						{
							buildProp.readOnly = true;
							prop = prop.slice (1);
						}
						if (opts.hasOwnProperty ('map'))
						{
							buildProp.type = 'mapped-object'
							buildProp.map = {};
							buildProp.reverseMap = {};
							__buildMappedObject(opts.map, buildProp.map, buildProp.reverseMap);
						}
						else
						{
							buildProp.type = 'property';
						}
						
						if (prop.endsWith ('*'))
						{
							buildProp.toJSON =  opts.toJSON;
							buildProp.type = 'remoted';
							prop = prop.slice (0, -1);
						}
						buildProp.name = prop === '=' || prop === '' ? i:prop;
						buildProp.jsonName = i;
					break;
				}
				buildProp.array = isArray;
				
				if (buildProp.hasOwnProperty ('name'))
				{
					buildMap[buildProp.jsonName] = buildReverseMap[buildProp.name] = buildProp;
				}
				else
				{
					continue;
				}
				if (!constructor) continue;
				
				switch (buildProp.type)
				{
					case 'property':
						if (opts.hasOwnProperty ('instanceOf')) buildProp.instanceOf = opts.instanceOf;
						Remoted.__createAccessor (constructor, buildProp.name, buildProp.readOnly);
					break;
					case 'remoted':
						if (opts.hasOwnProperty ('instanceOf')) buildProp.instanceOf = opts.instanceOf;
						if (buildProp.array) constructor.prototype.__remotedCollectionProps[buildProp.name] = buildProp;
						else
						{
							constructor.prototype.__remotedProps[buildProp.name] = buildProp;
                        }
						break;
					case 'remote-method':
						Remoted._createRemoteMethod (constructor, buildProp.name);
					break;
					case 'mapped-object':
						
					break;
				}
			}
			/*
			if (!buildMap.hasOwnProperty ('id'))
			{
				Object.defineProperty (constructor.prototype, 'id', {
					get: function () { return this._id; }
				});
			}
			*/
		}

		function __buildMappedObject (map, buildMap, buildReverseMap)
		{			
			if (typeof map != 'object') return buildMap;

			var prop;
			var buildProp;
			var buildReverseProp;
			var isArray;
			for (var i in map)
			{
				isArray = false;
				if (!angular.isArray(map[i])) map[i] = [map[i]];
				else if (angular.isArray (map[i][0]))
				{
					isArray = true;
					map[i][0] = map[i][0][0];
				}
				prop = map[i][0];
				buildProp = {};
				switch (typeof prop)
				{
					case 'boolean' :
						if (prop)
						{
							buildProp.name = buildProp.jsonName = i;
							buildProp.type = 'property';
						}
					break;
					case 'string':
						buildProp.name = prop === '=' || prop === '' || prop.startsWith(':') ? i:prop;
						buildProp.jsonName = i;
						buildProp.type = 'property';
					break;
					case 'object':

						if (prop.hasOwnProperty ('map'))
						{
							buildProp.type = 'mapped-object';
							buildProp.map = {};
							buildProp.reverseMap = {};
							__buildMappedObject (prop.map, buildProp.map, buildProp.reverseMap);
						}
						buildProp.name = prop === '=' || prop === '' ? i:prop.name;
						buildProp.jsonName = i;
					break;
				}
				
				buildProp.array = isArray;
				
				if (buildProp.hasOwnProperty ('name'))
				{
					buildMap[buildProp.jsonName] = buildReverseMap[buildProp.name] = buildProp;
				}
			}
		}

		Remoted.__createRemotedCollections = function (obj)
		{
			for (var i in obj.__remotedCollectionProps)
			{
				obj[obj.__remotedCollectionProps[i].name] = new RemotedCollection (obj, obj.__remotedCollectionProps[i].name, obj.__remotedCollectionProps[i].instanceOf);
			}
		};

		Remoted.__createAccessor = function (constructor, name, readOnly)
		{
			var pname = '__'+name+'__';
			var fn;
			var getter;
			var setter;
			var rSetter;
			var asGetterSetter;
			
			
			getter = function ()
			{
				return this[pname];
			};
			
			if (typeof constructor.prototype[name] == 'function')
			{
				constructor.prototype['__'+name] = constructor.prototype[name]; 
				
				var fn = constructor.prototype[name];
				delete constructor.prototype[name];
				
				setter = function (val)
				{
					if (this[pname] !== val)
					{
						var nVal = fn.call (this, val, true);
						if (typeof nVal !== 'undefined')
						{
							this[pname] = nVal;
							this.emit (name+'-change', nVal, true);
							this.remoteExecute (name, false, nVal);
						}
						else if (this[pname] === val)
						{
							this.emit (name+'-change', val, true);
							this.remoteExecute (name, false, val);
						}
					}
				};
				
				rSetter = function (val)
				{
					if (this[pname] !== val)
					{
						var nVal = fn.call(this, val, false);
						if (typeof nVal !== 'undefined')
						{
							this[pname] = nVal;
							this.emit (name+'-change', nVal, false);
						}
					}
				};
				
				asGetterSetter = function (val)
				{
					if (typeof val === 'undefined') return this[pname];
					var p;
					if (this[pname] !== val)
					{
						var nVal = fn.call (this, val, true);
						if (typeof nVal !== 'undefined')
						{
							this[pname] = nVal;
							this.emit (name+'-change', nVal, true);
							p = this.remoteExecute (name, true, nVal);
						}
						else if (this[pname] === val)
						{
							this.emit (name+'-change', val, true);
							p = this.remoteExecute (name, true, val);
						}
						this.emit (name+'-ack', p);
						return p;
					}
					p = Promise.resolve(val);
					this.emit (name+'-ack', p);
					return p;
				}
			}
			else
			{
				setter = function (val)
				{
					if (this[pname] !== val)
					{
						this[pname] = val;
						this.emit (name+'-change', val, true);
						this.remoteExecute (name, false, val);
					}
				};
				
				rSetter = function (val)
				{
					this[pname] = val;
					this.emit (name+'-change', val, false);
				};
				
				asGetterSetter = function (val)
				{
					if (typeof val === 'undefined') return this[pname];
					var p;
					if (this[pname] !== val)
					{
						this[pname] = val;
						this.emit (name+'-change', val, true);
						p = this.remoteExecute (name, true, val);
						this.emit (name+'-ack');
						return p;
					}
					p = Promise.resolve(val);
					this.emit (name+'-ack');
					return p;
				}
			}
			
			if (readOnly)
			{
				Object.defineProperty (constructor.prototype, name, {
					get: getter
				,   enumerable: true
				});
				Object.defineProperty (constructor.prototype, 'r_'+name, {
				    set: rSetter
				,   enumerable: false
				});
			}
			else
			{
				Object.defineProperty (constructor.prototype, name, {
					get: getter
				,   set: setter
				,   enumerable: true
				});
					
				Object.defineProperty (constructor.prototype, 'r_'+name, {
				    set: rSetter
				,   enumerable: false
				});
				constructor.prototype[name+'Async'] = asGetterSetter;
			}
		};

		Remoted.__createRemoteMethod = function (constructor, name)
		{
			if (typeof constructor.prototype[name] == 'function')
			{
				constructor.prototype['__'+name] = constructor.prototype[name]; 
				constructor.prototype[name] = function ()
				{
					var args = this['__'+name].apply(this, Array.prototype.slice.call(arguments).concat(true));
					if (args == undefined)
					{
						args =  Array.prototype.slice.call(arguments);
					}
					else if (!angular.isArray (args))
					{
						args = Array.prototype.slice.call(args);
					}
					return this.remoteExecute.apply (this, [name, true].concat(args));
				}
			}
			else
			{
				constructor.prototype[name] = function ()
				{
					return this.remoteExecute.apply (this, [name, true].concat(Array.prototype.slice.call(arguments)));
				}
			}
		}
		
		Remoted.__createRemoteStaticMethod = function (constructor, name)
		{
			if (typeof constructor[name] == 'function')
			{
				constructor['__'+name] = constructor[name]; 
				constructor[name] = function ()
				{
					var args = this['__'+name].apply(this, arguments);
					if (args == undefined)
					{
						args =  Array.prototype.slice.call(arguments);
					}
					else if (!angular.isArray (args))
					{
						args = Array.prototype.slice.call(args);
					}
					return this.remoteStaticExecute.apply (this, [name, true].concat(args));
				}
			}
			else
			{
				constructor[name] = function ()
				{
					return remoteService.execute.apply (remoteService, [this.remotedName, null, name, true].concat (Array.prototype.slice.call(arguments)));
				}
			}
		}
		
		return {
			'register': Remoted.register
		,   'inherits': Remoted.inherits
		};
	}]);
	
	return Remoted;
});