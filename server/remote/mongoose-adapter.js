"use strict";

var mongoose = require ('mongoose')
,   ObjectId = mongoose.Types.ObjectId
,   util = require ('util')
,   Util = require ('../helpers/util')
,   cache = require ('./cache')
,   dbCleaning = require ('../config').dbCleaning
,   inheritor = require ('../helpers/inheritor')
,	NotFoundError = require ('../helpers/errors/not-found-error');

mongoose.set('debug', false);

function adapter () {}

adapter.prototype.update = function (data, user)
{
	var result = {};
	var toSave = [];
	if (!this.__static.__super.prototype.validate.call (this, data, user, result))
	{
		return result;
	}
	this._update (data, user);
	for (var i in result)
	{
		toSave.push (i);
	}
	return this.saveAsync(toSave)
	.catch (function (err)
	{
		console.error (err);
	})
	.return (result);
};

adapter.prototype.saveAndUpdate = function (paths, socket)
{
	this.remoteUpdate(paths, socket);
	this.save(paths);
};

adapter.prototype.saveAsyncAndUpdate = function (paths, socket)
{
	this.remoteUpdate(paths, socket);
	return this.saveAsync(paths);
};

adapter.prototype.save = function (paths)
{
    if (!this.__asyncSave)
    {
        this.__asyncSavePaths = {};
        this.__asyncSave = true;
        if (!this.__asyncSavePending)
        {
            process.nextTick(()=>
            {
                this.__triggerSave();
            });
        }
    }

    switch (typeof paths)
    {
        case 'string':
            if (this.__map[paths] && this.__map[paths].propType === 'remoted')
            {
                paths = paths + '_id';
            }
            this.__asyncSavePaths[paths] = true;
        break;
        case 'object':
            if (!util.isArray (paths)) break;
            for (let i = paths.length-1; i>=0; i--)
            {
                let path = paths[i];
                if (this.__map[path] && this.__map[path].propType === 'remoted')
                {
                    path = path + '_id';
                }
                this.__asyncSavePaths[path] = true;
            }
    }
};

adapter.prototype.saveAsync = function (paths)
{
    if (!this.__asyncSaveDefer) this.__asyncSaveDefer = Util.defer();
    this.save(paths);
	return this.__asyncSaveDefer.promise;
};

adapter.prototype.__triggerSave = function ()
{
    if (this.destroyed) return this.__asyncSave = false;
    let paths = Object.keys(this.__asyncSavePaths);
    for (let i = paths.length-1; i>=0; i--)
    {
        this.model.markModified (paths[i]);
    }
    this.__asyncSave = false;
    this.__asyncSavePaths = null;
    this.__asyncSavePending = true;
    let p = this.model.saveAsync();
    if (this.__asyncSaveDefer)
    {
        p.reflect()
        .then((inspect) =>
        {
            let defer = this.__pendingAsyncSaveDefer;
            this.__pendingAsyncSaveDefer = null;
            if (inspect.isFulfilled())
            {
                defer.resolve(inspect.value());
            }
            else if (inspect.isRejected())
            {
                defer.reject(inspect.reason());
            }
            else
            {
                defer.reject('');
            }
        });
        this.__pendingAsyncSaveDefer = this.__asyncSaveDefer;
    }
    else
    {
        p.catch((e) =>
        {
            console.error (this.__static.name);
            console.error (e);
        });
    }

    p.finally(() =>
    {
        this.__asyncSavePending = false;
        if (this.__asyncSave)
        {
            this.__triggerSave();
        }
    });
    this.__asyncSaveDefer = null;
};

adapter.prototype.remove = function ()
{
	return this.model.remove().exec();
};


adapter.prototype.destroy = function (keepInDB)
{
    if (typeof keepInDB !== 'boolean')
    {
        keepInDB = !this.initialized;
    }

    //console.log ('MONGOOSE DESTROY : '+this.__static.name+ ' - mongoose keepInDB : '+keepInDB);

    if (!keepInDB)
	{
		this.model.remove();
	}

    if (this.__pendingAsyncSaveDefer)
    {
        this.__pendingAsyncSaveDefer.reject("Save aborted, because object was destroyed");
    }

    this.save = Util.noop;
	this.saveAsync = Util.noop;
	this.update = Util.noop;
	return this.__super.prototype.destroy.call(this);
};

adapter.find = function (search)
{
	return this.model.find(this.compileSearch(search)).exec();
};

adapter.findOne = function (search)
{
	var type = this;
	search = this.compileSearch(search);
	return this.model.findOne(search).exec()
	.then(function (model)
	{
		if (!model)
		{
			throw new NotFoundError(null, search, type);
		}
		return model;
	});
};

adapter.findById = function (search)
{
	var type = this;
	return this.model.findById(search).exec()
	.then(function (model)
	{
		if (!model)
		{
			throw new NotFoundError(null, search, type);
		}
		return model;
	});
};

adapter.compileSearch = function (search)
{
	search = Object.assign({}, search);
	for (var i in search)
	{
		let searchVal = search[i];
		if (i.length>3 && i.endsWith('_id'))
		{
			if (!search[i]) continue;
			let name = i.slice(0, -3);
			let prop = this.prototype.__reverseMap[name];
			let type = null;
			if (!prop)
			{
				console.log (name);
				console.log (search);
				console.log (Object.keys(this.prototype.__reverseMap));
			}
			switch (typeof prop.type)
			{
				case 'string':
					type = prop.type;
				break;
				case 'function':
					type = prop.type.name;
				break;
				case 'object':
					if (Array.isArray(prop.type))
					{
						type = {$in: prop.type.slice(0)};
					}
				break;
			}
			if (prop && prop.propType === 'remoted')
			{
				if (typeof searchVal === "object")
				{
					if (!searchVal.type) search[i] = {type: type, id: checkIdType(searchVal, type)};
					else search[i] = {type: searchVal.type, id: checkIdType(searchVal.id, searchVal.type)};
				}
				else
				{
					search[i] = {type: type, id: checkIdType(searchVal, type)};
				}
			}
		}
		else if (this.prototype.__reverseMap.hasOwnProperty(i) && this.prototype.__reverseMap[i].propType === 'remoted')
		{
			let prop = this.prototype.__reverseMap[i];
			let type = null;
			switch (typeof prop.type)
			{
				case 'string':
					type = prop.type;
					break;
				case 'function':
					type = prop.type.name;
					break;
				case 'object':
					if (Array.isArray(prop.type))
					{
						type = {$in: prop.type.slice(0)};
					}
					break;
			}
			if (!search[i])
			{
				search[i+'_id'] = null;
			}
			else if (typeof searchVal === "object")
			{
				if (searchVal.isRemoted)
				{
					search[i+'_id'] = {type: searchVal.__static.name, id: searchVal._id};
				}
				else if (!searchVal.type)
				{
					search[i+'_id'] = {type: type, id: checkIdType(searchVal, type)};
				}
				else search[i+'_id'] = {type: searchVal.type, id: checkIdType(searchVal.id, searchVal.type)};
			}
			else if (typeof prop.type === 'function')
			{
				search[i+'_id'] = {type: type, id: checkIdType(searchVal, type)};
			}
			delete search[i];
		}
	}
	return search;
};

function checkIdType(id, type)
{
	if (Array.isArray(type))
	{
		let hasObjectId = false;
		let hasOther = false;
		for (var i = 0, l = type.length; i<l; i++)
		{
			try
			{
				type = cache.getType(type);
				type = type.prototype.__map._id.type;
				if (type === ObjectId)
				{
					hasObjectId = true;
				}
				else
				{
					hasOther = true;
				}
			}
			catch(e)
			{
				hasOther = true;
			}
			if (hasOther && hasObjectId) break;
		}
		if (hasOther && hasObjectId) return {$in: [id, ObjectId(id)]};
		else if (hasObjectId) return ObjectId(id);
		else return id;
	}
	else
	{
		try
		{
			type = cache.getType(type);
			type = type.prototype.__map._id.type;
			if (type === ObjectId)
			{
				return ObjectId(id);
			}
			return id;
		}
		catch (e)
		{
			return id;
		}
	}
}

adapter.getAll = Promise.method(function (cachedOnly)
{
	if (cachedOnly)
	{
		return Util.toArray(cache.all(this));
	}
	else
	{
		return this.get({});
	}
});

adapter.get = function (search)
{
	return this.find(search)
	.bind(this)
	.map(function (model)
	{
		return cache.get (this, model).initialize().reflect();
	})
	.filter(function (inspection)
	{
		if (inspection.isFulfilled())
		{
			return true;
		}
		else
		{
			if (inspection.reason() instanceof Error)
			{
				console.error ('Some instance of '+this.name+' is not initialized in get : ');
				console.error (inspection.reason().message);
			}
			else
			{
				console.error ('Some instance of '+this.name+' is not initialized in get : ' + inspection.reason());
			}
			return false;
		}
	})
	.map(function (inspection)
	{
		return inspection.value();
	});
};

adapter.getOne = function (search)
{
	var instance = cache.getOneBy (this, search);
	if (instance) return instance.initialize();

	return this.findOne(search)
	.bind(this)
	.then (function (model)
	{
        return cache.get(this, model).initialize();
	})
	.catch (NotFoundError, function (error)
	{
		throw new NotFoundError (this.name+' with criterias : '+JSON.stringify (search)+' not found in database', search, this);
	}).bind();
};

adapter.getOneOrCreate = function (search, data)
{
	var instance = cache.getOneBy (this, search);
	if (instance) return instance.initialize();

	return this.findOne (search)
	.bind(this)
	.then (function (model)
	{
        return cache.get(this, model).initialize();
	})
	.catch (NotFoundError, function (error)
	{
        return cache.get(this, Util.mixin (data, search)).initialize();
	});
};

adapter.create = function (data)
{
	return cache.get(this, data).initialize();
};

adapter.getById = function (id)
{
	let instance = cache.exists (this, id);
	if (instance) return instance.initialize();

	return this.findById (id)
	.bind(this)
	.then (function (model)
	{
		return cache.get(this, model).initialize();
	})
	.catch (NotFoundError, function (error)
	{
		throw new NotFoundError (this.name+' with id : '+id+' not found in database', error.search, this);
	})
    .bind();
};

adapter._getById = function (id, circularRemotedMap)
{
	var instance = cache.exists (this, id);
	if (instance)
	{
		return Promise.resolve(instance);
	}

	return this.findById(id)
	.bind(this)
	.then (function (model)
	{
		model.__circularRemotedMap__ = circularRemotedMap;
		return cache.get(this, model);
	})
	.catch (NotFoundError, function (error)
	{
		throw new NotFoundError (this.name+' with id : '+id+' not found in database', error.search, this);
	})
	.bind();
};

exports = module.exports = function (constructor)
{
	if (constructor.prototype.hasOwnProperty('destroy') &&  typeof constructor.prototype.destroy === 'function')
	{
		var destroy = constructor.prototype.destroy;
	}
	inheritor.implements (constructor, adapter);
	if (destroy)
	{
		constructor.prototype.destroy = function ()
		{
			try
			{
				var r = destroy.apply(this, arguments);
			}
			catch (error)
			{
				return adapter.prototype.destroy.apply(this, arguments);
			}
			if (r instanceof  Promise)
			{
				var args = arguments;
				return r
				.bind(this)
				.then(function()
				{
					adapter.prototype.destroy.apply(this, args);
				});
			}
			else
			{
				return adapter.prototype.destroy.apply(this, arguments);
			}
			return r;
		}
	}
};