const privates = require ('./privates');
const cache = require("./cache");
const EventEmitter = require("events");
  
const debug = require('util').debuglog ('remote');

class Remote extends EventEmitter
{
	constructor()
	{
		super();
        this.pendingCreateOperations = new Set();
        this.flushCreateOperations = this._flushCreateOperations.bind(this);
	}

    create (instance, socket)
    {
        const id = instance.__static.name + '-' + instance._id;
        if (this.pendingCreateOperations.hasOwnProperty(id))
        {
            if (socket) this.pendingCreateOperations[id].socket = socket;
            return;
        }
        this.pendingCreateOperations[id] = {socket: socket, instance: instance};
        setTimeout(this._flushCreateOperations);
    }

    _create (instance, socket)
    {
        var type = instance.__static.name;
        var jsons = {};
        var json;
        var userType;
        var iSocket;

        if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');

        debug('remote create : '+ type+ ' with id : '+instance._id);

        for (const connection of instance[privates.connections])
        {
            iSocket = connection;
            if (socket && iSocket == socket) continue;
            userType = instance.userIs (iSocket.user);
            json = jsons[userType] || (jsons[userType] = instance.toJSON (iSocket.user));
            iSocket.emit ('remote-create', type, json);
        }
    }

    flushCreateOperations ()
    {
        for (var i in this.pendingCreateOperations)
        {
            this._create(this.pendingCreateOperations[i].instance, this.pendingCreateOperations[i].socket);
        }
        this.pendingCreateOperations = {};
    }

    update (instance, fields, socket)
    {
        var type = instance.__static.name;
        var jsons = {};
        var json;
        var userType;
        var iSocket;

        if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');

        debug ('remote update : '+ type+ ' with id : '+cache.idOf (instance));

        for (const connection of instance[privates.connections])
        {
            iSocket = connection;
            if (socket && iSocket === socket) continue;

            userType = instance.userIs (iSocket.user);
            json = jsons[userType] || (jsons[userType] = instance.toJSON (fields, iSocket.user));
            iSocket.emit ('remote-update', type, json);
        }
    }

    execute (instance, method, socket)
    {
        var type = instance.__static.name;

        if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');

        debug ('remote execute '+method+'() on '+ type);
        for (const connection of instance[privates.connections])
        {
            if (socket && socket === connection) continue;
            connection.emit.apply(connection, ['remote-execute', type, cache.idOf (instance), method].concat(Array.prototype.slice.call(arguments, 3)));
        }
    }

    destroy (instance)
    {
        var type = instance.__static.name;

        if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');

        debug ('remote destroy '+ type + ' : '+ instance._id);
        
        for (const connection of instance[privates.connections])
        {
            connection.emit('remote-destroy', instance.__static.name, cache.idOf(instance));
            connection.unlink(instance);
        }
    }
}

Remote.prototype.executeRemotedAccessor = function (instance, method, socket, argument)
{
	var type = instance.__static.name;
	var jsons = {};
	var json;
	var userType;
	var iSocket;
	
	if (!cache.isRegistered (type)) throw new Error (type + ' is not a registered Type');
	
	debug ('remote execute remoted accessor '+method+'() on '+ type);
	for (const connection of instance[privates.connections])
	{
		iSocket = connection;
		if (socket && socket === iSocket) continue;
		if (argument === null)
		{
			json = null
		}
		else
		{
			userType = argument.userIs (iSocket.user);
			json = jsons[userType] || (jsons[userType] = argument.toJSON (iSocket.user));
		}
		try 
		{
			iSocket.emit.apply(iSocket, ['remote-execute', type, cache.idOf (instance), method, json]);
		}
		catch (error)
		{
			console.error (error.stack);
		}
	}
};

Remote.prototype.executeCollectionMethod = function (instance, method, action, socket)
{
    var type = instance.__static.name;
    var jsons = {};
    var json;
    var userType;
    var iSocket;

    if (!cache.isRegistered(type)) throw new Error(type + ' is not a registered Type');

    debug('remote execute ' + method + '() on ' + type);

    switch (action)
    {
		case 'insert':
        case 'add':
        case 'move':
            if (arguments.length < 5) return;
            var addedInstance = arguments[4];
            for (let i in instance[privates.connections])
            {
                iSocket = connection;
                if (socket && iSocket == socket) continue;
                userType = addedInstance.userIs(iSocket.user);
                json = jsons[userType] || (jsons[userType] = addedInstance.toJSON(iSocket.user));
                iSocket.emit.apply(iSocket, ['remote-execute', type, cache.idOf(instance), method, action, json].concat(Array.prototype.slice.call(arguments, 5)));
            }
        break;
		case 'set':
			let instances = arguments[4];
			for (let i in instance[privates.connections])
			{
                iSocket = connection;
                if (socket && iSocket === socket) continue;
                json = instances.map((instance) =>
                {
                    userType = instance.userIs(iSocket.user);
                    return jsons[userType+instance._id] || (jsons[userType+instance._id] = instance.toJSON(iSocket.user))
                });
				iSocket.emit.apply(iSocket, ['remote-execute', type, cache.idOf(instance), method, action, json]);
			}
		break;
		case 'remove':
			let data = {_id: arguments[4]._id, __type__: arguments[4].__static.name};
			for (let i in instance[privates.connections])
			{
				if (socket && socket === connection) continue;
				connection.emit.apply(connection, ['remote-execute', type, cache.idOf(instance), method, action, data]);
			}
		break;
        default:
            for (let i in instance[privates.connections])
            {
                if (socket && socket === connection) continue;
                connection.emit.apply(connection, ['remote-execute', type, cache.idOf(instance), method].concat(Array.prototype.slice.call(arguments, 4)));
            }
        break;
    }
};

exports = module.exports = new Remote ();