const privates = require('./privates');

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
                dynamixRemote.update (this, name, nVal);
                this.save(name);
            }
        }
    },
    simpleHooked (name, preHook, postHook, index)
    {
        return {
            accessor: {
                get ()
                {
                    return this[privates.store][name];
                },
                set (value)
                {
                    if (this[privates.store][name] === value) return;
                    if (preHook)
                    {
                        value = preHook.call(this, value);
                        if (typeof value === 'undefined') return;
                    }
                    if (index) if (!cache.updateIndex(this, name, value, this[privates.store][name])) return;
                    this.$store[name] = value;
                    dynamixRemote.update (this, name, value);
                    this.save(name);
                    if (postHook) postHook.call(this, value)
                }
            }
        }
    },
    remoted (name)
    {
        const destroyHandlers = new Map();

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
                return this.$[name];
            },
            set (value)
            {
                if (this.$[name])
                {
                    this.$[name].removeListener('destroy', getDestroyHandler(this));
                }
                this.$[name] = value;
                if (value === null)
                {
                    this.$store[name] = null;
                }
                else
                {
                    value.once('destroy', getDestroyHandler(this));
                    this.$store[name] = value.toReference();
                }
                this.$store.markModified(name);
            }
        }
    },
    remotedCollection (name)
    {
        return {
            get ()
            {
                return this.$[name];
            },
            set (value)
            {
                if (Array.isArray(value))
                {
                    this.$[name].set(value);
                }
            }
        }
    },
};