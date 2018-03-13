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

    cache.register(constructor);
    constructor.chmodStatic (0);

    if (typeof map != 'object')
    {
        throw new Error ('Function __buildMap for "'+constructor.name+'" : argument map is not an object');
    }
    if (this.prototype.hasOwnProperty ('__map'))
    {
        throw new Error ('Function __buildMap for "'+constructor.name+'" : map was already been set');
    }

    this.map = {};
    this.reverseMap = {};
    this.collections = {};
    this.remoteds = {};
    this.prototype.__dataAdapters = {};
    this.prototype.isRemoted = true;
    this.NotFoundError = NotFoundError;

    defaultOpts = defaultOpts || {};
    if (!defaultOpts.hasOwnProperty ('required')) defaultOpts.required = false;
    if (!defaultOpts.hasOwnProperty ('private')) defaultOpts.private = false;
    if (!defaultOpts.hasOwnProperty ('nullWhenNotFound')) defaultOpts.nullWhenNotFound = true;
    if (map.hasOwnProperty ('remotedMethods'))
    {
        if (typeof map.remotedMethods === 'object')
        {
            for (var i in map.remotedMethods)
            {
                this.chmod (i, map.remotedMethods[i]);
            }
        }
        delete map.remotedMethods;
    }
    if (map.hasOwnProperty ('remotedStaticMethods'))
    {
        if (typeof map.remotedStaticMethods === 'object')
        {
            for (var i in map.remotedStaticMethods)
            {
                this.chmodStatic (i, map.remotedStaticMethods[i]);
            }
        }
        delete map.remotedStaticMethods;
    }
    if (map.hasOwnProperty ('__CRUD__'))
    {
        if (typeof map.__CRUD__ === 'object')
        {
            if (map.__CRUD__.hasOwnProperty('create'))	this.chmod ('__create__', map.__CRUD__.create);
            if (map.__CRUD__.hasOwnProperty('update'))	this.chmod ('__update__', map.__CRUD__.update);
            if (map.__CRUD__.hasOwnProperty('read'))	this.chmod ('__read__', map.__CRUD__.read);
            if (map.__CRUD__.hasOwnProperty('destroy'))	this.chmod ('__destroy__', map.__CRUD__.destroy);
        }
        delete map.__CRUD__;
    }

    if (!map.hasOwnProperty ('_id'))
    {
        if (virtual)
        {
            map._id = ['=', 444, {type: String, default: getUID}];
        }
        else
        {
            map._id = ['=', 444, {type: mongoose.Types.ObjectId, default: mongoose.Types.ObjectId}];
        }
    }

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

//Property

