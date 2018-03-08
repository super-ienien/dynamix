define (
[
    './remote-module'
,   './remoted'
,	'socketio'
,	'object-path'
,   './remote-cache'
]
,
function (module, Remoted, io, objectPath)
{
	'use strict';
	module
	.factory ('remoteService', ['$timeout', 'remoteCache', 'util', '$rootScope', '$filter', '$location', function ($timeout, remoteCache, util, $rootScope, $filter, $location)
	{
		var _socket;
		var _uid;
		var _executeUid = 0;
		var _callbackTimeout = 10000;
		
		function RemoteService ()
		{
			this.user;
			this.initialized = false;
			this.connected = false;
			this._syncRules = {};
			this.currentNamespace = '';
			this._newInstanceBuffer = {};
			
			RemoteService.__super.call 
			({
				newListener: true,
				maxListeners: 20
			});
			
			this._newInstanceBufferingHandler = newInstanceBufferingHandler.bind(this);
			this._newInstanceDefaultHandler = newInstanceDefaultHandler.bind(this);
			this.newInstanceBufferStarted = false;
			this._hasNewInstance = false;
			remoteCache.watcher.on ('new', this._newInstanceDefaultHandler)
		}
		
		util.asEventEmitter (RemoteService);
		
		RemoteService.prototype.connect = function (namespace, path, ssid)
		{
			if (this.connected) return;
			var self = this;
			$rootScope.initialized = this.initialized = false;
			_uid = util.randomString (128);
			if (_socket) _socket.removeAllListeners();
			if (!this._syncRules.hasOwnProperty(namespace)) this._syncRules[namespace] = {sync:{}, update:{}};
			this.currentNamespace = namespace;
			var p = '';
			var s = $location.search();
			if (Object.keys(s).length > 0)
			{
				p = [];
				for (var i in s)
				{
					p.push (i + '=' + encodeURIComponent(s[i]));
				}
				p = '&' + p.join('&')
			}
			_socket = io (namespace, {
				multiplex: false
			,   query: "uid="+_uid+p+'&nsp='+namespace+(ssid ? '&ssid='+ssid:'')
			,   path: path
            ,   secure: true
			,   reconnection: true
			,	reconnectionDelay: 100
			,	reconnectionDelayMax: 1000
			,	timeout: 5000
            });
			_socket.on ('connect', function ()
			{
				self.connected = true;
				$rootScope.rs = true;
				$rootScope.connected = true;
				console.log ('Socket connected');
				self.emit('connect');
				$rootScope.$applyAsync();
			});
			_socket.on ('error', function (error)
			{
				console.log ('Socket connect error');
				console.log (error);
				if (error == "Authentication error")
				{
					this.emit('authentication-error');
				}
				else
				{
					this.connect();
				}
			});
			_socket.on ('disconnect', function ()
			{
				console.log ('remote service disconnected');
				self.connected = false;
				$rootScope.connected = false;
				console.log ('Socket disconnected');
				self.emit('disconnect');
				$rootScope.$applyAsync();
			});
			_socket.on ('remote-init', _initHandler.bind(this));
			_socket.on ('remote-kill', _killHandler.bind(this));
			_socket.on ('is-alive', _isAliveHandler.bind(this));
			window.onunload = function () 
			{
				console.log ('unload disconnect');
				_socket.disconnect();
			};
			return this.initialize();
		};
		
		RemoteService.prototype.disconnect = function ()
		{
			this.emit ('manual-disconnect');
			$rootScope.rs = false;
			_socket.disconnect();
		};
		
		function _nextExecuteUid ()
		{
			if (_executeUid > 9999) _executeUid = 0;
			return _executeUid = _executeUid+1;
		}
		/**
		* @param {string} type
		* @param {string} id
		* @param {string} method
		**/
		RemoteService.prototype.execute = function (type, id, method, hasCallback)
		{
			return this._remoteCommand ('execute', [type, id, method].concat(Array.prototype.slice.call(arguments, 4)), hasCallback);
		};
		
		RemoteService.prototype.update = function (instance, fields, hasCallback)
		{
			let type = instance.__static.remotedName;
			if (angular.isArray(fields))
			{
				if (fields.indexOf ('_id') === -1) fields.push('_id');
			}
			else if (fields !== '_id')
			{
				fields = [fields, '_id'];
			}

			return this._remoteCommand('update', [type, instance.toJSON(fields, false)], hasCallback);
		};
		
		RemoteService.prototype.create = function (type, data, hasCallback)
		{
			return this._remoteCommand('create', [type, data], hasCallback);
		};
		
		RemoteService.prototype.destroy = function (instance, hasCallback)
		{
			var type = instance.__static.remotedName;
			var self = this;
			return this._remoteCommand('destroy', [type, instance._id], hasCallback).then(function()
			{
				instance.r_destroy();
				self.emit ('destroy'+type, instance);
			});
		};
		
		RemoteService.prototype._remoteCommand = function (command, args, hasCallback)
		{
			console.debug (command + ' sent');
			console.debug (args);
			
			if (hasCallback)
			{
				return new Promise (function (resolve, reject)
				{
					var uid = _nextExecuteUid();
					_socket.emit.apply (_socket, ['remote-'+command, uid].concat(args));
					var to = $timeout(function ()
					{
						_socket.removeEventListener ('remote-execute-callback-'+uid);
						reject(new Error ('server timeout for '+command+'callback : '+uid));
						console.debug (args);
					}, _callbackTimeout, false);
					_socket.once('remote-'+command+'-callback-'+uid, function (result)
					{
						$timeout.cancel(to);
						console.debug (command + ' callback received : '+uid);
						console.debug (result);
						switch (typeof result)
						{
							case 'object' :
								if (result != null)
								{
									if (result.fulfilled)
									{
										resolve (result.value);
										break;
									}
									else	if (result.error)
									{
										reject (new Error (result.reason));
										break;
									}
									else if (result.reject)
									{
										reject (result.reason);
										break;
									}
								}
								else
								{
									reject (new Error ("server returned null"));
									break;
								}
							default:
								resolve (result);
						}
					});
				});
			}
			else
			{
				_socket.emit.apply (_socket, ['remote-'+command, false].concat(args));
			}
		};

		Object.defineProperty (RemoteService.prototype, 'syncRules',
		{
			get: function ()
			{
				return this._syncRules[this.currentNamespace];
			}
		});
		
		RemoteService.prototype.syncRequest = function (type)
		{
			console.debug ('sync request sent : "'+type+'"');
			_socket.emit.call (_socket, 'remote-sync-request', type);
		};
		
		RemoteService.prototype.updateRequest = function (type, id)
		{
			console.debug ('update request sent : "'+type+'" - id : '+id);
			_socket.emit.call (_socket, 'remote-update-request', type, id);
		};

		RemoteService.prototype.syncRule = function (action, arg1, arg2)
		{
            var type;
			switch (action)
			{
				case 'sync':
					this.syncRules.sync[arg1] = true;
					if (arg2 === true && this.initialized)
                    {
                        var self = this;
                        window.setTimeout(function()
                        {
                            self.syncRequest(arg1);
                        });
                    }
				break;
				case 'update':
                    if (!angular.isArray (arg1)) arg1 = [arg1];
					for (var i = 0, l = arg1.length; i<l; i++)
					{
						if (arg1[i] instanceof Remoted)
                        {
                            type = arg1[i].__staticName;
                            arg1[i] = remoteCache.idOf (arg1[i]);
                        }
                        else
                        {
                            switch (typeof arg1[i])
                            {
                                case 'string':
                                    type = arg1[i];
                                break;
                                case 'function':
                                    type = util.getFunctionName(arg1[i]);
                                break;
                                default:
                                    continue;
                            }
                        }
                        if (!this.syncRules.update.hasOwnProperty (type)) this.syncRules.update[type] = {};
						this.syncRules.update[type][arg1[i]] = true;
                        if (arg2 === true && this.initialized) this.updateRequest (type, arg1[i]);
					}
				break;
			}
		};
		
		RemoteService.prototype.executeSyncRules = function (rules)
		{
			if (!this.initialized) return;
			rules = rules || this.syncRules;
			if (rules.hasOwnProperty ('update'))
			{
				var updates;
				var i;
				for (var type in rules.update)
				{
					updates = [];
					for (i in rules.update[type])					
					{
						updates.push (i);
					}
					this.updateRequest (type, updates);
				}
			}
			if (rules.hasOwnProperty ('sync'))
			{
				for (var type in rules.sync)
				{
					this.syncRequest (type);
				}
			}
		};
	
		RemoteService.prototype.startNewInstanceBuffer = function ()
		{
			if (this.newInstanceBufferStarted) return;
			remoteCache.watcher.removeListener ('new', this._newInstanceDefaultHandler)
			remoteCache.watcher.on ('new', this._newInstanceBufferingHandler);
			this.newInstanceBufferStarted = true;
		};
		
		RemoteService.prototype.flushNewInstanceBuffer = function (stop)
		{
			if (this._hasNewInstance)
			{
				for (var i in this._newInstanceBuffer)
				{
					this.emit ('new'+i, this._newInstanceBuffer[i].splice(0, this._newInstanceBuffer[i].length));
				}
				this._hasNewInstance = false;
			}
			if (stop) this.stopNewInstanceBuffer();
		}
	
		RemoteService.prototype.stopNewInstanceBuffer = function ()
		{
			if (!this.newInstanceBufferStarted) return;
			remoteCache.watcher.removeListener ('new', this._newInstanceBufferingHandler);
			remoteCache.watcher.on ('new', this._newInstanceDefaultHandler)
			this.newInstanceBufferStarted = false;
		}
		
		function newInstanceBufferingHandler (instance, type)
		{
			if (!this._newInstanceBuffer.hasOwnProperty (type)) this._newInstanceBuffer[type] = [];
			this._newInstanceBuffer[type].push (instance);
			this._hasNewInstance = true;
		}
	
		function newInstanceDefaultHandler (instance, type)
		{
			this.emit ('new'+type, [instance]);
		}
	
		function _initHandler (inidata)
		{
			if (this.initialized) return;
			console.log ('INITIAL DATA : ');
			console.log (inidata);
			var self = this;
			_socket.on ('remote-create', _createHandler.bind(this));
			_socket.on ('remote-sync', _syncHandler.bind(this));
			_socket.on ('remote-update', _updateHandler.bind(this));
			_socket.on ('remote-execute', _executeHandler.bind(this));
			_socket.on ('remote-destroy', _destroyHandler.bind(this));
			_socket.on ('remote-init', function ()
			{
				self.executeSyncRules();
			});

			$rootScope.initialized = this.initialized = true;
			this.serverTimeDelta = Date.parse(inidata.serverTime) - Date.now();
			console.log ('SERVER TIME DELTA : ' + this.serverTimeDelta);
			this.initialData = inidata;
			this.executeSyncRules ({sync: this.syncRules.sync});
			if ($rootScope.user && $rootScope.user.id != inidata.remoted.user.data._id || !$rootScope.user)
			{
				if ($rootScope.user)
				{
					$rootScope.user.removeListener ('dirty', _onUserDirty);
				}
				$rootScope.user = remoteCache.get(inidata.remoted.user.type, jsonCircularRemoteRevivor(inidata.remoted.user.type, inidata.remoted.user.data));
				this.user = $rootScope.user;
				delete inidata.remoted.user;
				$rootScope.user.on ('dirty', _onUserDirty);
			}
			for (var i in inidata.remoted)
			{
				try {
					inidata[i] = remoteCache.get(inidata.remoted[i].type, jsonCircularRemoteRevivor(inidata.remoted[i].type, inidata.remoted[i].data));
					this.syncRule ('update', inidata[i]);
					delete inidata.remoted[i];
				}
				catch (e)
				{
					console.warn(e);
				}
			}
			if (Object.keys(inidata.remoted).length === 0) delete inidata.remoted;
			var modules = [];
			var userModules = [];
			for (var i=0, l=inidata.modules.length; i<l; i++)
			{
				if (inidata.modules[i].userModule) userModules.push(inidata.modules[i]);
				else modules.push(inidata.modules[i]);
			}
			
			$rootScope.modules = $filter('orderBy')(modules, 'index');
			$rootScope.userModules = $filter('orderBy')(userModules, 'index');
			this.emit ('initialized', inidata);
		}

        RemoteService.prototype.initialize = function ()
        {
            var self = this;
            if (this.initialized)
			{
				if (this.initialData.hasOwnProperty('remoted'))
				{
					for (var i in this.initialData.remoted)
					{
						try {
							this.initialData[i] = remoteCache.get(this.initialData.remoted[i].type, this.initialData.remoted[i].data);
							this.syncRule ('update', this.initialData[i]);
							delete this.initialData.remoted[i];
						}
						catch (e)
						{
							console.error(e.stack);
						}
					}
					if (Object.keys(this.initialData.remoted).length === 0) delete this.initialData.remoted;
				}
				return Promise.resolve(this.initialData).bind(this);
			}
            else return new Promise (function (resolve, reject)
            {
                self.once('initialized', ok);
                self.once('authentication-error', notOk);

                function ok()
                {
                	self.removeListener('authentication-error', notOk);
                    resolve (self.initialData);
                }

                function notOk()
                {
                    self.removeListener('initialized', ok);
                    reject();
                }
            }).bind(this);
        };

        RemoteService.prototype.serverDate = function ()
		{
			return new Date(this.serverNow());
		};

        RemoteService.prototype.serverNow = function ()
		{
			return Date.now() + this.serverTimeDelta;
		};

		function _onUserDirty ()
		{
			$rootScope.$apply();
		}
		
		function _isAliveHandler ()
		{
			_socket.emit('keep-alive');
		}
		
		function _killHandler (killdata)
		{
			_socket.disconnect();
			// Pas bien de le mettre là mais on verra plus tard
			$state.go('login', {killed: true, location: false});
			this.emit('kill', killdata);
		}
		
		function _createHandler (type, data)
		{
			console.debug ('create received : "'+type+'"');
			jsonCircularRemoteRevivor(type, data);
			this.startNewInstanceBuffer();
			var instance = remoteCache.exists (type, data);
			if (instance)
			{
				instance.update (data);
				this.flushNewInstanceBuffer(true);
				return;
			}
			remoteCache.get (type, data);
            this.flushNewInstanceBuffer(true);
        }
		
		function _syncHandler (type, data)
		{
			if (!remoteCache.isRegistered(type)) return;
			jsonCircularRemoteRevivor(type, data);
			this.startNewInstanceBuffer();
			console.debug ('sync received : "'+type+'"');
			console.debug (data);
			var newInstances = [];
			var toDestroy = angular.copy(remoteCache.all(type));
			var j;
			
			if (!angular.isArray(data))
			{
				data = [data];
			}
			for (var i = 0, l = data.length; i<l; i++)
			{
				var instance = remoteCache.exists (type, data[i]);
				if (instance)
				{
					instance.update(data[i]);
					delete toDestroy[remoteCache.idOf(data[i])];
				}
				else
				{
					instance = remoteCache.get (type, data[i]);
					if (instance) newInstances.push (instance);
				}
			}
			for (j in toDestroy)
			{
				toDestroy[j].r_destroy();
			}
			this.flushNewInstanceBuffer(true);

			//A REVOIR
			if (newInstances.length==0 && j != undefined)
			{
				this.emit ('destroy'+type);
			}
			this.emit ('sync'+type);
		}
		
		function _updateHandler (type, data)
		{
			console.debug ('update received'+type);
			jsonCircularRemoteRevivor(type, data);
			this.startNewInstanceBuffer();
			if (!angular.isArray(data))
			{
				data = [data];
			}
			for (var i = 0, l = data.length; i<l; i++)
			{
				var instance = remoteCache.exists (type, data[i]);
				if (instance)
				{
					instance.update(data[i]);
				}
			}
			this.flushNewInstanceBuffer(true);
		}

		var _executeHandler = function (type, id, method)
		{
			console.debug ('execute received'+method+' on '+type+' - '+id);
			this.startNewInstanceBuffer();
			var instance = remoteCache.exists (type, id);
			if (instance)
			{
				if (!(typeof instance[method] === 'function'))
				{
                    if (instance.__reverseMap.hasOwnProperty(method))
                    {
                        if (instance.__reverseMap[method].array && instance.__reverseMap[method].type === 'remoted' && typeof instance[method]['r_' + arguments[3]] === 'function')
                        {
                            instance[method]['r_'+arguments[3]].apply(instance[method], Array.prototype.slice.call(arguments, 4).concat(this))
                        }
                        else if ((instance.__reverseMap[method].type === 'property' || instance.__reverseMap[method].type === 'remoted') && arguments.length == 4)
                        {
                            var data = {};
                            data[instance.__reverseMap[method].jsonName] = arguments[3];
							jsonCircularRemoteRevivor(type, data);
							instance.update(data);
                        }
                    }
				}
				else
				{
					instance[method].apply(instance, Array.prototype.slice.call (arguments, 3));
				}
			}
			this.flushNewInstanceBuffer(true);
		}
		
		function _destroyHandler (type, data)
		{
			console.debug ('destroy received : '+type);
			var instance = remoteCache.exists (type, data);
			if (instance)
			{
				instance.r_destroy();
				this.emit ('destroy'+type, instance);
			}
		}

		function jsonCircularRemoteRevivor (type, json, path)
		{
			if (typeof type === 'string') type = remoteCache.getType(type);
			if (!type) return json;
			var obj;
			if (path)
			{
				obj = objectPath.get(json, path, false);
				if (!obj) return;
			}
			else
			{
				obj = json;
				path = '';
			}

			for (var i in type.prototype.__remotedProps)
			{
				var prop = type.prototype.__remotedProps[i];
				if (typeof obj[prop.jsonName] === 'string')
				{
					obj[prop.jsonName] = obj[prop.jsonName] ? objectPath.get(json, obj[prop.jsonName]):json;
				}
				else if (obj[prop.jsonName])
				{
					jsonCircularRemoteRevivor (prop.instanceOf, json, path+ (path ? '.':'') +prop.jsonName);
				}
			}

			for (var i in type.prototype.__remotedCollectionProps)
			{
				var prop = type.prototype.__remotedCollectionProps[i];
				if (!angular.isArray(obj[prop.jsonName])) continue;
				var collection = obj[prop.jsonName];
				for (var j = 0, l = collection.length; j<l; j++)
				{
					if (typeof collection[j] === 'string')
					{
						collection[j] = collection[j] ? objectPath.get(json, collection[j]):json;
					}
					else
					{
						jsonCircularRemoteRevivor (prop.instanceOf, json, path+ (path ? '.':'') +prop.jsonName+'.'+j);
					}
				}
			}
			return json;
		}
		
		return new RemoteService();
	}]);
});