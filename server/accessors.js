const privates = require('./privates');

module.exports = {
    simple (prop, willUpdate, didUpdate, index)
    {
        const name = prop.name;
        return {
            accessor: {
                get ()
                {
                    return this[privates.store][name];
                },
                set (value, user)
                {
                    if (this[privates.store][name] === value) return;
                    if (willUpdate)
                    {
                        value = willUpdate.call(this, value, user);
                        if (typeof value === 'undefined') return;
                    }
                    if (index) cache.updateIndex(this, name, value, this[privates.store][name]); //todo throw an error
                    this[privates.store][name] = value;
                    this.$save(name, !!user); //save only in DB if user is provided
                    if (didUpdate) didUpdate.call(this, value, user);
                }
            }
        }
    },
    remoted (prop, willUpdate, didUpdate, index)
    {
        const name = prop.name;
        const symbol = prop.symbol;
        const inheritsDomains = prop.inheritsDomains;
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
            if (this[privates.store][name] !== val) return;
            if (index) if (!cache.updateIndex(this, name, null, this[privates.virtualStore][name])) return;
            this[privates.virtualStore][name] = null;
            this[privates.store][name] = '';
            this.$save(name);
        }

        return {
            get ()
            {
                return this[privates.virtualStore][name];
            },
            set (value, user)
            {
                if (this[privates.virtualStore][name] === value) return;

                if (willUpdate) willUpdate.call(this, value, user);
                this[symbol] = value;
                this.$save(name, !!user); //save only in DB if user is provided
                if (didUpdate) didUpdate.call(this, value, user);
            },
            symbolSetter(value)
            {
                let oldValue = this[privates.virtualStore][name];
                if (index) cache.updateIndex(this, name, value, oldValue);
                if (oldValue)
                {
                    oldValue[privates.removeParent](this);
                    oldValue.removeListener('destroy', getDestroyHandler(this));
                    if (inheritsDomains === true)
                    {
                        for (let domain in this[privates.domains])
                        {
                            oldValue.$deleteDomain(domain);
                        }
                    }
                    else if (Array.isArray(inheritsDomains))
                    {
                        inheritsDomains.forEach((domain) => oldValue.$deleteDomain(domain));
                    }
                }
                if (value === null)
                {
                    this[privates.store][name] = '';
                }
                else
                {
                    value[privates.addParent](this);
                    if (inheritsDomains === true)
                    {
                        for (let domain in this[privates.domains])
                        {
                            value.$setDomain(domain, this[privates.domains][domain]);
                        }
                    }
                    else if (Array.isArray(inheritsDomains))
                    {
                        inheritsDomains.forEach((domain) => oldValue.$setDomain(domain, this[privates.domains][domain]));
                    }
                    value.once('destroy', getDestroyHandler(this));
                    this[privates.store][name] = value.toString();
                }

                this[privates.virtualStore][name] = value;
            }
        }
    },
    collection (prop)
    {
        const name = prop.name;
        return {
            get ()
            {
                return this[privates.virtualStore][name];
            },
            set (value, user)
            {
                if (Array.isArray(value))
                {
                    this[privates.virtualStore][name].set(value, user);
                }
            }
        }
    },
};