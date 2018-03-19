
const map = new Symbol('map');

class DynamixRequest
{
    constructor(connection, request)
    {
        this[map] = {};
        if (request === true) request = connection.root.__static.allFields;

        if (typeof request === 'string')
        {
            let prop = connection.root.__static.map[request];
            if (!prop) throw new DynamixRequestError(connection, request, 'Field '+request+' not found');
            if (prop.checkUserAccess (this.user, 'r')) {
                if (prop.isRemoted)
                {
                    const val = root[privates.virtualStore][request];
                    if (prop.isArray)
                    {
                        if (val.length === 1 && val[0])
                        {
                            ret.subRequests = {[request]: parse(connection, val[0].__static.defaultFields, val[0])};
                        }
                        else if (val.length > 1)
                        {
                            const types = {};
                            for (let type of val.usedTypes)
                            {
                                types[type.name] = type.defaultFields;
                            }
                            ret.subRequests = {[request]: parse(connection, types)}
                        }
                    }
                    else if ()
                    {
                        ret.subRequests = {[request]: parse(connection, prop.defaultFields)};
                    }
                }
                ret.map[request] = prop;
            }
        }
        else if (Array.isArray(request))
        {
            const map = root.__static.map;
            for (let i = 0; i < request.length; i++)
            {
                let field = request[i];
                let prop = map[field];
                if (!prop) throw new DynamixRequestError(connection, field, 'Field '+field+' not found');
                if (prop.checkUserAccess (this.user, 'r')) {
                    if (prop.isRemoted)
                    {
                        if (!ret.subRequests) ret.subRequests = {};
                        ret.subRequests[field] = parse(connection, prop.defaultFields, root);
                    }
                    ret.map[request] = prop;
                }
            }
        }
        else throw new DynamixRequestError(connection, request, 'Invalid request');
    }

    getMap(instance)
    {
        
    }
}