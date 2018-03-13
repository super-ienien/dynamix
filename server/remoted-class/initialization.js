const helpers = require('../helpers');
const privates = require ('../privates');

function initialize (dynamix, data)
{
    const steps = [];

    if (typeof dynamix.willInitialize === 'function')
    {
        steps.push({
            step () {
                return dynamix.willInitialize(data)
            },
            done (value) {
                data = value || data;
            }
        });
    }

    steps.push(() => hydrate(dynamix, data));

    if (typeof dynamix.didInitialize === 'function')
    {
        steps.push(() => dynamix.didInitialize());
    }
}

function hydrate (dynamix, data = {})
{

    let fromDB = false;
    if (data instanceof dynamix.__static.model)
    {
        fromDB = true;
        dynamix[privates.store] = data;
    }
    else
    {
        dynamix[privates.store] = new this.__static.model();
    }

    const map = dynamix.__static.map;
    const store = dynamix[privates.store];
    const virtualStore = dynamix[privates.virtualStore];

    let toSave = [];
    let promises = [];

    for (let propName in map)
    {
        let prop = map[propName];
        let isDefaultValue = false;
        let needSave = false;
        let promise = null;

        let val = typeof data[propName];
        if (typeof val === 'undefined' && prop.defaultValue)
        {
            val = prop.defaultValue(dynamix, data);
            isDefaultValue = true;
        }

        if (!prop.isRemoted)
        {
            if (fromDB) continue;
            if (prop.isArray)
            {
                if (Array.isArray(val))
                {
                    store[propName] = val;
                    //store[propName] = isDefaultValue || fromDB ? val : val.map(prop.normalize); // normalize moved to validation phase
                }
                else
                {
                    store[propName] = [];
                }
            }
            else
            {
                if (typeof val !== 'undefined')
                {
                    store[propName] = val;
                    //store[propName] = isDefaultValue || fromDB ? val : prop.normalize(val); // normalize moved to validation phase
                }
                else if (prop.isRequired)
                {
                    throw new Error('Missing value for required property "' + propName + '"');
                }
            }
        }
        else
        {
            if (prop.isArray)
            {
                if (Array.isArray(val))
                {
                    promise = Promise.all(val.map((item) => helpers.inspectPromise(initializeRemotedValue(item))))
                    .then((result) => {
                        for (let i = 0, l = result.length; i<l; i++)
                        {
                            let inspection = result[i];
                            if (inspection.isFulfilled)
                            {
                                dynamix[propName].add(inspection.value);
                            }
                            else
                            {
                                console.warn ('Item initialization error for collection "'+propName+'"  in ' + dynamix.__static.name);
                                console.warn (inspection.reason);
                                if (inspection.reason instanceof NotFoundError) needSave = true;
                            }
                        }
                    });
                }
                notFound = false; /* TODO : à checker */
            }
            else
            {
                val = initializeRemotedValue(val);
                if (val instanceof Remoted)
                {
                    if (val.initialized)
                    {
                        virtualStore[propName] = val;
                    }
                    else
                    {
                        promise = val.initialize();
                    }
                }
                else if (val instanceof Promise)
                {
                    promise = val;
                }

                if (promise)
                {
                    promise
                    .catch((e) => {
                        if (e instanceof NotFoundError && prop.required)
                        {
                            throw new Error('Missing value for required property "'+propName+'"');
                        }
                        else
                        {
                            throw e
                        }
                    })
                    .then((val) => {
                        virtualStore[propName] = val || null;
                    });
                }
                else if (prop.isRequired && !val)
                {
                    throw new Error('Missing value for required property "'+propName+'"');
                }
                else
                {
                    virtualStore[propName] = val || null;
                }
            }
        }

        if (isDefaultValue) needSave = true;
        if (promise)
        {
            promise.then(() => {
                if (needSave) toSave.push(propName);
            });
            promises.push(promise)
        }
        else
        {
            if (needSave) toSave.push(propName);
        }
    }

    if (promises.length)
    {
        return Promise.all(promises)
        .then (function ()
        {
            if (!fromDB)
            {
                return dynamix.save();
            }
            else if (toSave.length)
            {
                dynamix.save(toSave);
            }
        })
        .catch (function (error)
        {
            console.error ('Error during initialization of '+ dynamix.__static.name+ ' _id : '+data._id);
            console.error (error);
            abort(dynamix);
        });
    }
    else
    {
        if (!fromDB)
        {
            return dynamix.save();
        }
        else if (toSave.length)
        {
            dynamix.save(toSave);
        }
    }
}

function initializeRemotedValue (val)
{
    if (val instanceof Remoted || val instanceof Promise) return val;
    if (!val) return null;
    switch (typeof val)
    {
        case 'string':
            val = helpers.parseIdString(val);
            if (!val) return null;
        case 'object':
            let type = cache.getType(val._type);
            if (type)
            {
                val = cache.exists (type.name, val._id);
                if (!val)
                {
                    return type.findById (id)
                    .then (model => cache.get(this, model))
                    .catch (function (error)
                    {
                        if (error instanceof NotFoundError)
                        {
                            throw new NotFoundError (this.name+' with id : '+id+' not found in database', error.search, this);
                        }
                        else
                        {
                            throw error;
                        }
                    });
                }
            }
            break;
    }
    return null;
}