const {Schema} = require('mongoose');
const Validation = require('./validation');

const allowedTypes = {
    any: {
        mongooseType: Schema.types.Mixed,
        validation: null,
        default: null
    },
    array: {
        mongooseType: [],
        validation: Validation.types.array
    },
    boolean: {
        mongooseType: Boolean,
        validation: Validation.types.boolean
    },
    date: {
        mongooseType: Date,
        validation: Validation.types.date
    },
    integer: {
        mongooseType: Number,
        validation: Validation.types.integer
    },
    number: {
        mongooseType: Date,
        validation: Validation.types.date
    },
    object: {
        mongooseType: Object,
        validation: Validation.types.date
    },
    remoted: {
        mongooseType: String,
        validation: Validation.types.remoted
    },
    string: {
        mongooseType: String,
        validation: Validation.types.string
    }
};

function build (name, opts)
{
    let {type, isRemoted, isArray, initializeValue, normalize} = parseType(opts.type);
    let prop = {
        access: buildAccess(opts.access)
    ,   defaultType
    ,   defaultValue: buildDefaultValue(opts.default, defaultType, isRemoted)
    ,   initializeValue: initializeValue
    ,   isArray
    ,   isRemoted
    ,   isRequired: typeof opts.required === 'undefined' ? true:!!opts.required
    ,   isPersistent: !global.persistent ? false:!!opts.persistent
    ,   name
    ,   normalize: normalize
    ,   type
    ,   validator: buildValidator(opts, type, isRequired, isRemoted)
    };
}

function buildDefaultValue (defaultValue, defaultType, isRemoted)
{
    if (!isRemoted)
    {
        switch (typeof defaultValue)
        {
            case 'object':
                if (!val) return null;
                return () => _.cloneDeep(defaultValue);
            case 'function':
                return defaultValue;
            default:
                return () => defaultValue;
        }
    }
    else
    {
        switch (typeof defaultValue)
        {
            case 'object':
                if (!defaultValue || !defaultType) return null;
                return () => {
                    cache.getType(defaultType).getOneOrCreate(defaultValue);
                };
            case 'function':
                return defaultValue;
            default:
                return null;
        }
    }
}

Remoted.prototype._resolveDefaultRemoted = function (prop, obj, type)
{
    var data;
    type = cache.getType(type) || prop.type;
    switch (typeof prop.default)
    {
        case 'function':
            data = prop.default.call(this, obj[prop.name] || obj[prop.jsonName], obj);
            if (data instanceof Promise)
            {
                return data
                .bind(prop)
                .then(function (r)
                {
                    if (r instanceof Remoted)
                    {
                        return r;
                    }
                    else if (r && typeof r === 'object' && typeof type === 'function')
                    {
                        return type.getOneOrCreate(r);
                    }
                });
            }
            else if (typeof type === 'function')
            {
                return data !== null ? type.getOneOrCreate(data) : null;
            }
            break;
        case 'object':
            if (typeof type === 'function') return type.getOneOrCreate(prop.default);
            break;
    }
};














function parseType (typeOpts)
{
    const ret = {
        type: false,
        defaultType: false,
        isRemoted: false,
        isArray: false,
        initializeValue: initializeAnyValue
        normalize: null
    };

    if (typeOpts)
    {
        if (Array.isArray(typeOpts))
        {
            ret.isArray = true;
            typeOpts = typeOpts[0];
        }

        if (typeof typeOpts === 'function')
        {
            typeOpts = typeOpts.name;
        }

        if (typeof typeOpts !== 'string') throw new Error ('Invalid schema type property : ' + JSON.stringify(typeOpts));

        let types = typeOpts.split('|');
        for (let i = 0, l = types.length; i<l; i++)
        {
            type = types[i].trim();
            let knownType = allowedTypes[type.toLowerCase()];
            if (knownType)
            {
                if (ret.isRemoted) throw new Error ('Mix Remoted types with regular types is not allowed');
                if (index > 0) throw new Error ('Defining multiple regular types is not allowed');

                if (type === 'remoted')
                {
                    ret.isRemoted = true;
                    ret.type = 'remoted';
                    ret.normalize = ret.isArray ? allowedTypes.remoted.validation.normalizeArray:allowedTypes.remoted.validation.normalize;
                }
                else
                {
                    ret.type = type.toLowerCase();
                    if (knownType.validation) ret.normalize = ret.isArray ? knownType.validation.normalizeArray:knownType.validation.normalize;
                }
                return;
            }
            else
            {
                if (!ret.isRemoted && index > 0)
                {
                    throw new Error ('Cannot mix Remoted types with regular types');
                }
                if (index === 0)
                {
                    ret.type = type;
                    ret.defaultType = type;
                }
                else if (index === 1) ret.type = [ret.type, type];
                else ret.type.push(type);
                ret.isRemoted = true;
                ret.normalize = ret.isArray ? allowedTypes.remoted.validation.normalizeArray:allowedTypes.remoted.validation.normalize
            }
        }
    }

    return ret;
}

const forbiddenValidatorsName = ['type', 'required', 'persistent', 'access'];
function buildValidator (opts, type, isRequired, isRemoted)
{
    let validationPool;
    if (isRequired)
    {
        validationPool = validation.createValidationPool();
        validationPool.add('required');
    }
    if (isRemoted && type !== 'remoted')
    {
        if (!validationPool) validationPool = validation.createValidationPool();
        validationPool.add('remoted', type);
    }
    for (let i in opts)
    {
        if (forbiddenValidatorsName.indexOf(i) > -1) continue;
        if (Validation.validators.has(i))
        {
            if (!validationPool) validationPool = validation.createValidationPool();
            validationPool.add(i, opts[i]);
        }
    }
    return validationPool;
}