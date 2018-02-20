module.exports = {
    simple (name)
    {
        return {
            get ()
            {
                return this.$store[name];
            },
            set (value)
            {
                this.$store[name] = value;
            }
        }
    },
    remoted (name)
    {
        let privateValue = null;
        const destroyHandlers = new WeakMap();
        function getDestroyHandler (instance)
        {
            if (destroyHandlers.has(instance)) return destroyHandlers.get(instance);
            const handler = onDestroy.bind(instance);
            destroyHandlers.set(instance, handler);
            return handler;
        }

        function onDestroy (val)
        {
            if (privateValue !== val) return;
            privateValue = null;
            this.$store[name] = null;
            this.save(name);
        }
        return {
            get ()
            {
                return privateValue;
            },
            set (value)
            {
                if (privateValue)
                {
                    privateValue.removeListener('destroy', getDestroyHandler(this));
                }
                privateValue = value;
                if (value === null)
                {
                    this.$store[name] = null;
                }
                else
                {
                    value.once('destroy', getDestroyHandler(this));
                    this.$store[name] = {_id: value._id, type: value.$static.name};
                }
                this.$store.markModified(name);
            }
        }
    },
    remotedCollection (name)
    {
        let privateValue = null;
    }
};

Remoted.__createModelRemotedCollectionLinkGetter = function (name)
{
    var localname = '$_'+name;
    return function ()
    {
        return this[localname];
    }
};

Remoted.__createModelRemotedCollectionLinkSetter = function (name)
{
    var localname = '$_'+name;
    return function (val)
    {
        this[localname] = val;
        this.$store[name+'_ids'] = val.getIds();
        this.$store.markModified(name+'_ids');
    }
};

Remoted.__createRemotedIdAccessor = function (constructor, name)
{
    Object.defineProperty(constructor.prototype, name+'_id', {
        get: function ()
        {
            if (this[name]) return this[name]._id;
            return null;
        }
    });
};

Remoted.__createProperty = function (constructor, name)
{
    if (typeof constructor.prototype[name] == 'function')
    {
        constructor.prototype['__'+name] = constructor.prototype[name];
        delete constructor.prototype[name];
    }
};

Remoted.__

Remoted.__localHookedAccessor = function (n, virtual)
{
    return function (val)
    {
        var name, nVal;
        name = n;
        if (typeof val === 'undefined') return this['_'+name];
        if (this['_'+name] === val) return this['_'+name];
        nVal = this['__'+name](val);

        if (typeof nVal === 'undefined') nVal = val;
        else if (nVal instanceof Promise)
        {
            return nVal.bind(this).then (function (nVal)
            {
                if (typeof nVal === 'undefined') nVal = val;
                if (this['_'+name] !== nVal) this['_'+name] = nVal;
                this.remoteExecute (name, false, nVal);
                if (!virtual) this.save(name);
                return nVal;
            });
        }
        if (this['_'+name] !== nVal) this['_'+name] = nVal;
        this.remoteExecute (name, false, nVal);
        if (!virtual) this.save(name);
        return nVal;
    };
};

Remoted.__remoteHookedAccessor = function (n, virtual)
{
    return function (val, socket, validation)
    {
        var name, nVal;
        name = n;
        if (val == undefined) return this['_'+name];
        if (this['_'+name] === val) return Promise.resolve(val).bind(this);

        //Validation
        validation = typeof validation === 'undefined' ? true:validation;
        if (validation)
        {
            var result = this.validateOne(name, val, socket.user);
            if (result.isInvalid)
            {
                throw result;
            }
        }

        nVal = this['__'+name](val, socket.user, socket);
        if (typeof nVal === 'undefined') nVal = val;
        else if (nVal instanceof Promise)
        {
            return nVal.bind(this).then (function (nVal)
            {
                if (nVal == undefined)	nVal = val;
                if (this['_'+name] !== nVal)
                {
                    this['_'+name] = nVal;
                }
                this.remoteExecute (name, socket, nVal);
                if (!virtual) this.save(name);
                return nVal;
            });
        }
        if (this['_'+name] !== nVal)
        {
            this['_'+name] = nVal;
        }
        this.remoteExecute (name, nVal !== val ? false:socket, nVal);
        if (!virtual) this.save(name);
        return Promise.resolve(nVal).bind(this);
    };
};

Remoted.__localAccessor = function (name, virtual)
{
    return function (val)
    {
        if (typeof val === 'undefined') return this['_'+name];
        if (this['_'+name] === val) return this['_'+name];
        this['_'+name] = val;
        this.remoteExecute (name, false, val);
        if (!virtual) this.save(name);
        return val;
    };
};

Remoted.__remoteAccessor = function (n, virtual)
{
    return function (val, socket, validation)
    {
        var name = n;
        if (typeof val === 'undefined') return this['_'+name];
        if (this['_'+name] === val) return this['_'+name];

        //Validation
        validation = typeof validation === 'undefined' ? true:validation;
        if (validation)
        {
            var result = this.validateOne(name, val, socket.user, socket);
            if (result.isInvalid)
            {
                throw result;
            }
        }

        this['_'+name] = val;
        var self = this;

        //A voir si c'est bien
        setImmediate (function () {self.remoteExecute (name,socket, val)});
        if (!virtual) this.save(name);
        return val;
    };
};
