const Security = require ('../security');

module.exports = {
    validate (dynamix, data, user, result)
    {
        let retBool = true;
        const security = typeof user === 'object';
        if (typeof result !== 'object')
        {
            retBool = false;
            result = {};
        }
        let success = true;
        let nbProp = 0;
        for (let i in data)
        {
            if (!dynamix.__static.map.hasOwnProperty(i))
            {
                delete data[i];
                continue;
            }
            let prop = dynamix.__static.map[i];

            if (security && !Security.isAllowed (dynamix, prop, 'w', user))
            {
                console.error ('Warning : update aborted for property "'+prop.name+'" - user "'+user.name()+'" not allowed');
                result[prop.name] = {
                    invalid: {security: true}
                ,   isInvalid: true
                };
                delete data[i];
                success = false;
                continue;
            }
            if (prop.hasValidator)
            {
                result[prop.name] = prop.isArray ? prop.validator.validateArray (data[i]):prop.validator.validate (data[i]);
                if (result[prop.name].isInvalid)
                {
                    console.error ('Warning : update aborted for property "'+prop.name);
                    delete data[i];
                    success = false;
                    continue;
                }
                else if (prop.propType === 'remoted')
                {
                    const instance = dynamix[prop.name];
                    if (instance) result[prop.name] = instance.validate(data[i]);
                }
            }
            else
            {
                result[prop.name] = {
                    valid: {}
                ,   isValid: true
                };
            }
            nbProp++;
        }
        if (nbProp === 0)
        {
            success = false;
        }
        return retBool ? success:result;
    }
,   validateOne (dynamix, name, value, user)
    {
        let prop;
        const security = typeof user === 'object';
        if (!dynamix.__static.map.hasOwnProperty(name))
        {
            if (!dynamix.__static.reverseMap.hasOwnProperty(name))
            {
                return {
                    invalid: {error: true}
                ,   isInvalid: true
                };
            }
            prop = dynamix.__static.reverseMap[name];
        }
        else
        {
            prop = dynamix.__static.__map[name];
        }

        if (security && !Security.isAllowed (dynamix, prop, 'w', user))
        {
            console.error ('Warning : update aborted for property "'+prop.name+'" - user "'+user.name()+'" not allowed');
            return {
                invalid: {security: true}
            ,   isInvalid: true
            };
        }

        if (prop.hasValidator)
        {
            return prop.array ? prop.validator.validateArray (value):prop.validator.validate (value);
        }
        else
        {
            return {
                valid: {}
            ,   isValid: true
            };
        }
    }
};