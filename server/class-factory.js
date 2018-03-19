const privates = require ('./privates');
const cache = require ('./cache');
const lodash = require ('lodash');

const defaultOptions = {
    defaults: {
        required: true,
        persistent: true
    },
    virtual: false
};

module.exports = function DynamixClassFactory ()
{
    const {constructor, options} = parseFactoryArguments(arguments);

    if (cache.getType(constructor.name)) throw new Error ('"'+constructor.name+'" already registered');

    cache.register(constructor);

    if (typeof options.schema !== 'object') throw new Error ('No map found for "'+constructor.name+'"');


    const {map, collectionsMap} =
    constructor.map = map;
    constructor.collectionsMap = collectionsMap;
    constructor.methodsMap = methodsMap;
    constructor.prototype.$isRemoted = true;



    if (!options.persistent) map._id = {type: String, default: getUID};

    __buildMap.call(this, map, this.prototype.__map, this.prototype.__reverseMap, this.prototype.__remotedProps, defaultOpts, virtual);
    __compileMap (this.prototype.__map, this);

    this.virtual = virtual;
    if (virtual)
    {
        if (this.prototype.hasOwnProperty('destroy') && typeof this.prototype.destroy === 'function')
        {

            var destroyFn = this.prototype.destroy;
            this.prototype.destroy = function ()
            {
                try
                {
                    var r = destroyFn.apply(this, arguments);
                }
                catch (error)
                {
                    console.error (error);
                    return Remoted.prototype.destroy.apply(this, arguments);
                }
                if (r instanceof  Promise)
                {
                    var args = arguments;
                    return r.bind(this).then(function()
                    {
                        Remoted.prototype.destroy.apply(this, args);
                    });
                }
                else
                {
                    return Remoted.prototype.destroy.apply(this, arguments);
                }
            }
        }
    }
    else if (!this.__hasPendingDependencies)
    {
        __buildPersistent(this);
    }

    Remoted.__checkForDependencyCompletion (this);
};

function parseFactoryArguments(args)
{
    const ret = {
        constructor: null,
        options: defaultOptions
    };

    for (let i = 0; i<args.length; i++)
    {
        let arg = args[i];
        switch (typeof arg)
        {
            case 'function':
                ret.constructor = arg;
            break;
            case 'object':
                if (arg !== null) _.merge({}, ret.options, arg);
            break;
        }
    }
    if (ret.constructor === null) throw new Error ('Invalid arguments in Dynamix register. You must provide a class constructor.');
    return ret;
}

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

function buildMaps (schema)
{
    const map = {};
    const collectionsMap = {};
    const relationsMap = {};

    for ()
}

function buildProperty (name, opts, defaults)
{
    const {type, defaultType, isArray, isRemoted, normalize} = parseType(opts.type);
    const isRequired = typeof opts.required === 'undefined' ? true:!!opts.required;
    const isPersistent = !global.persistent ? false:!!opts.persistent;

    let prop = {
        access: buildAccessRules (opts.access, defaults.domains)
    ,   defaultType
    ,   defaultValue: buildDefaultValue(opts.default, defaultType, isRemoted)
    ,   index: !!opts.index
    ,   isArray
    ,   isRemoted
    ,   isRequired
    ,   isPersistent
    ,   name
    ,   normalize
    ,   type
    ,   validator: buildValidator(opts, type, isRequired, isRemoted)
    ,   checkUserAccess
    };
}

function buildAccessRules (val, defaultRule)
{
    let rules = {};
    if (!val)
    {
        return rules;
    }
    switch (typeof val)
    {
        case 'string':
            switch (val)
            {
                case 'r':
                    if (defaultRule) rules.r = {r: defaultRule.r};
                    else rules.r = true;
                    break;
                case 'w':
                case 'x':
                    if (defaultRule) rules.w = {w: defaultRule.w};
                    else rules.w = true;
                    break;
                default:
                    return buildAccessRules({[val]: 'w'});
            }
            break;
        case 'object':
        {
            for (let i in val)
            {
                let operation = val[i];
                switch (operation)
                {
                    case 'x':
                        operation = 'w';
                    case 'r':
                    case 'w':
                        let rule = {};
                        if (!rules[operation]) rules[operation] = [rule];
                        else rules[operation].push(rule);
                        let domains = [];
                        let roles = i.split('&').map((role) => role.trim()).filter((role) =>
                        {
                            if (role.startsWith('$'))
                            {
                                domains.push(role);
                                return false;
                            }
                            return !!role;
                        });

                        if (domains.length === 1) rule.domain = domains[0];
                        else if (domains.length > 1) rule.domains = domains;
                        if (roles.length === 1) rule.role = roles[0];
                        else if (roles.length > 1) rule.roles = roles;
                        break;
                    default:
                        throw new Error ('Invalid access value ' + i + ' > ' + operation);
                }
            }
        }
    }
    return rules;
}

function checkUserAccess (user, operation)
{
    let rules = this.access[operation];
    if (rules === true) return true;
    if (rules)
    {
        rules:
            for (let i = 0, l = rules.length; i < l; i++)
            {
                let rule = rules[i];
                if (rule.domain)
                {
                    if (!user[privates.domains].has(rules)) continue rules;
                }
                else if (rule.domains)
                {
                    for (let i = 0; i<rule.domains.length; i++)
                    {
                        if (user.$domains.has(rule.domains[i])) continue rules
                    }
                }
                if (rule.role)
                {
                    if (!user[privates.roles].has(rule.role)) continue rules;
                }
                else if (rule.roles)
                {
                    for (let i = 0; i<rule.roles.length; i++)
                    {
                        if (!user[privates.roles].has(rule.roles[i])) continue rules;
                    }
                }
                return true;
            }
    }
    return false;
}

function buildDefaultValue (defaultValue, defaultType, isRemoted)
{
    if (!isRemoted)
    {
        switch (typeof defaultValue)
        {
            case 'object':
                if (!val) return null;
                return function () { return _.cloneDeep(defaultValue) };
            case 'function':
                return function (...args) {
                    let r = defaultValue(...args);
                    if (r && typeof r === 'object')
                    {
                        if (r instanceof Remoted) return r;
                        if (!defaultType) return null;
                        return cache.getType(defaultType).getOneOrCreate(r);
                    }
                    return r;
                };
            default:
                return function () { return defaultValue };
        }
    }
    else
    {
        switch (typeof defaultValue)
        {
            case 'object':
                if (!defaultValue || !defaultType) return null;
                return function () { return cache.getType(defaultType).getOneOrCreate(defaultValue) };
            case 'function':
                return function () {
                    return defaultValue;
                };
            default:
                return null;
        }
    }
}

function parseType (typeOpts)
{
    const ret = {
        type: false,
        defaultType: false,
        isRemoted: false,
        isArray: false,
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
