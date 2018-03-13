const Security = require ('../security');
const ArrayNormalizer = require('./normalizers/array-normalizer');

const types = {
    array: {
        normalize: ArrayNormalizer
    ,   normalizeArray: buildArrayNormalizer(ArrayNormalizer)
    },
    boolean: {
        normalize: require('./normalizers/boolean-normalizer')
    ,   normalizeArray: buildArrayNormalizer(require('./normalizers/boolean-normalizer'))
    },
    date: {
        normalize: require('./normalizers/date-normalizer')
    ,   normalizeArray: buildArrayNormalizer(require('./normalizers/date-normalizer'))
    },
    integer: {
        normalize: require('./normalizers/integer-normalizer')
    ,   normalizeArray: buildArrayNormalizer(require('./normalizers/integer-normalizer'))
    },
    number: {
        normalize: require('./normalizers/number-normalizer')
    ,   normalizeArray: buildArrayNormalizer(require('./normalizers/number-normalizer'))
    },
    object: {
        normalize: require('./normalizers/object-normalizer')
    ,   normalizeArray: buildArrayNormalizer(require('./normalizers/object-normalizer'))
    },
    remoted: {
        normalize: require('./normalizers/remoted-normalizer')
        ,   normalizeArray: buildArrayNormalizer(require('./normalizers/remoted-normalizer'))
    },
    string: {
        normalize: require('./normalizers/string-normalizer')
    ,   normalizeArray: buildArrayNormalizer(require('./normalizers/string-normalizer'))
    }
};

module.exports = {
    validate
,   validateOne
,   types
,   createValidationPool
};

function createValidationPool ()
{
    return new ValidationPool();
}

function validate (dynamix, data, user, result)
{
    let retBool = true;
    const security = typeof user === 'object';
    if (!result)
    {
        retBool = false;
    }
    else if (typeof result === 'object')
    {
        retBool = false;
    }
    else
    {
        retBool = false;
        resulte = {};
    }

    let success = true;
    let nbProp = 0;
    for (let propName in data)
    {
        let value = data[propName];
        if (!dynamix.__static.map[propName])
        {
            delete data[propName];
            continue;
        }
        let prop = dynamix.__static.map[propName];

        if (security && !Security.isAllowed (dynamix, prop, 'w', user))
        {
            console.error ('Warning : update aborted for property "'+propName+'" - user "'+ user +'" not allowed');
            if (retBool)
            {
                return false;
            }
            else
            {
                result[propName] = {
                    invalid: {security: true}
                ,   isInvalid: true
                };
                success = false;
                continue;
            }
        }

        if (prop.normalize)
        {
            try
            {
                data[propName] = value = prop.normalize(data[propName]);
            }
            catch (e)
            {
                if (retBool)
                {
                    return false;
                }
                else
                {
                    result[propName] = {
                        invalid: {type: true}
                    ,   isInvalid: true
                    };
                    success = false;
                    continue;
                }
            }
        }

        if (prop.validator)
        {
            result[propName] = prop.isArray ? prop.validator.validateArray (value):prop.validator.validate (value);
            if (result[propName].isInvalid)
            {
                console.error ('Warning : update aborted for property "'+propName);
                delete data[propName];
                if (retBool)
                {
                    return false;
                }
                else
                {
                    success = false;
                    continue;
                }
            }
        }
        else if (prop.isRemoted)
        {
            const instance = dynamix[propName];
            if (instance)
            {
                if (!retBool)
                {
                    if (!validate (instance, value, user, false)) return false;
                }
                else
                {
                    result[propName] = validate (instance, value, user, true);
                }
            }
        }
        else
        {
            result[propName] = {
                isValid: true
            };
        }
        nbProp++;
    }
    if (nbProp === 0) success = false;
    return retBool ? success:result;
}

function validateOne (dynamix, propName, value, user)
{
    let prop = dynamix.__static.map[propName];
    if (!prop) return {
        invalid: {request: true}
    ,   isInvalid: true
    };

    const security = typeof user === 'object';
    if (security && !Security.isAllowed (dynamix, prop, 'w', user))
    {
        console.error ('Warning : update aborted for property "'+propName+'" - user "'+user+'" not allowed');
        return {
            invalid: {security: true}
        ,   isInvalid: true
        };
    }

    if (prop.normalize)
    {
        try
        {
            value = prop.normalize(data[propName]);
        }
        catch (e)
        {
            return {
                invalid: {type: true}
            ,   isInvalid: true
            };
        }
    }

    if (prop.validator)
    {
        return prop.isArray ? prop.validator.validateArray (value):prop.validator.validate (value);
    }
    else if (prop.isRemoted)
    {
        const instance = dynamix[propName];
        if (instance) return validate (instance, value, user, true);
    }

    return {
        isValid: true
    };
}

function buildArrayNormalizer (normalizer)
{
    return function (value)
    {
        value = ArrayNormalizer(value);
        if (value === null) return null;
        for (let i = 0, l = value.length; i<l; i++)
        {
            value[i] = normalizer(value[i]);
        }
    }
}