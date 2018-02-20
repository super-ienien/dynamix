const BaseObject = require ('./base-object');
const savesMap = new Map();
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {update} = require ('../toolbox/api');
const cache = require('./dynamix-cache');
const DBNotFoundError = require('./errors/db-not-found-error');
const Bluebird = require ('bluebird');
const _ = require ('lodash');

const types = new Map();
const pendingDependencies = new Map();

class Dynamix extends BaseObject
{

    static register (classObject, opts)
    {
        cache.register(classObject);

        const schema = opts.schema;
        const mongooseSchema = normalizeSchema(schema);

        for (let fieldName in schema)
        {
            let setter, getter;
            if (classObject.prototype.hasOwnProperty(fieldName))
            {
                const {get, set} = Object.getOwnPropertyDescriptor(classObject.prototype, fieldName);
                if (set)
                {
                    setter = function (val)
                    {
                        let res = set.call(this, val);
                        if (typeof res === 'undefined') return;
                        this.$store[prop] = res;
                        this.save(prop);
                        update(this, prop);
                    }
                }

                if (get)
                {
                    getter = function ()
                    {
                        return get.call(this);
                    }
                }
            }

            if (!setter)
            {
                setter = function (val)
                {
                    this.$store[prop] = val;
                    this.save(prop);
                    update(this, prop);
                }
            }

            if (!getter)
            {
                getter = function ()
                {
                    return this.$store[prop];
                }
            }

            Object.defineProperty(classObject.prototype, prop, {
                get: getter,
                set: setter
            });
        }

        Object.defineProperty(classObject.prototype, '_id', {
            get: function ()
            {
                return this.$store._id;
            },
        });

        let initSteps = [];
        if (typeof classObject.prototype.willInitialize === 'function') initSteps.push(classObject.prototype.willInitialize);
        initSteps.push(DynamixObject.prototype.initialize());
        if (typeof classObject.prototype.initialize === 'function') initSteps.push(classObject.prototype.initialize);
        initSteps.push(DynamixObject.prototype.initializeSuccess());
        if (typeof classObject.prototype.didInitialize === 'function') initSteps.push(classObject.prototype.didInitialize);

        classObject.prototype.initialize = function () {
            let p = helpers.rundown (initSteps, this);
            classObject.prototype.initialize = () => p;
            p.then(() => {
                this.initialized = true;
                classObject.prototype.initialize = () => Promise.resolve(this);
            })
            .catch((e) => {
                classObject.prototype.initialize = () => Promise.reject(e);
                cache.remove(this);
                throw e;
            });
            return p;
        };

        classObject.mongooseSchema = new Schema(mongooseSchema);
        classObject.schema = schema;
        classObject.model = mongoose.model(classObject.name, classObject.mongooseSchema);
        classObject.prototype.validators = opts.validators;
        classObject.prototype.__static = classObject;

        types.set(classObject.name, classObject);

        resolveCircularDependencies(this);
    }

    static getType (search)
    {
        switch (typeof search)
        {
            case 'function':
                return search;
            case 'string':
                return types.get(search);
            case 'object':
                if (Array.isArray(search)) return this.getType(search[0]);
        }
        return false;
    }

    static create (data)
    {
        return this.model.create(data)
        .then((doc) => (new this(doc)).initialize());
    }

    static get(search)
    {
        return Bluebird.resolve(this.model.find(search).exec())
        .map((model) =>
        {
            return (cache.get (this, model) || new this(model)).initialize();
        });
    };

    static getAll ()
    {
        return this.get({});
    }

    static getById(id)
    {
        let instance = cache.get (this, search);
        if (instance) return instance.initialize();

        return this.model.findById(id).exec()
        .then((model) =>
        {
            if (!model) throw new DBNotFoundError(this, {_id: search});
            return (new this(model)).initialize();
        });
    };

    static getOne (search)
    {
        let instance = cache.get (this, search);
        if (instance) return instance.initialize();

        return this.model.findOne(search).exec()
        .then((model) =>
        {
            if (!model) throw new DBNotFoundError(this, search);
            return (cache.get (this, model) || new this(model)).initialize();
        });
    }

    static getOneOrCreate (search, data)
    {
        return this.getOne(search)
        .catch ((e) =>
        {
            if (e instanceof DBNotFoundError)
            {
                return this.create(Util.mixin (data, search));
            }
            else throw e;
        });
    }

    constructor (store)
    {
        super();
        this.$meta = new DynamixMeta(this);
        this.$store = store;
        cache.add(this.__static, this);
    }

    initialize()
    {
        const refs = this.__static.refs;
        const refLists = this.__static.refLists;

        let promises = [];
        let toSave = new Set();

        for (let i in refs)
        {
            let val = this.$store[i];
            let field = refs[i];
            let {result, isBroken} = initializeRef(field, val);

            if (isBroken) toSave.add(i);

            if (result)
            {
                promises.push(result.then((instance) => {
                    if (!instance)
                    {
                        if (field.required) throw new Error ('Field '+i+' is required in '+this.__static.name + ' - ' + this._id);
                        if (val)
                        {
                            this[i] = null;
                            toSave.push(i);
                        }
                    }
                    else
                    {
                        this[i] = instance;
                    }
                }));
            }
            else if (field.required)
            {
                throw new Error ('Field '+i+' is required in '+this.__static.name + ' - ' + this._id);
            }
        }

        for (let i in refLists)
        {
            let val = this.$store[i];
            let field = refs[i];
            let itemPromises = [];
            this[i] = [];

            if (!Array.isArray(val)) continue;

            for (let j = 0, l = val.length; j<l; j++)
            {
                let item = val[j];
                let {result, isBroken} = initializeRef(field, item);

                if (isBroken) toSave.add(i);

                if (result)
                {
                    itemPromises.push(Bluebird.resolve(result).reflect());
                }
                else
                {
                    console.warn('item '+JSON.stringify(item)+' was skipped during initialization of '+this.__static.name+' on field '+field.name);
                }
            }

            Bluebird.filter((instanceInspection) => {
                if (instanceInspection.isFulfilled() && instanceInspection.value())
                {
                    return true;
                }
                else
                {
                    console.warn('item was skipped during initialization of '+this.__static.name+' on field '+field.name);
                    console.error (instanceInspection.reason());
                    toSave.add(i);
                    return false;
                }
            })
            .each(function (instanceInspection)
            {
                this[i].push(instanceInspection.value());
            })
            .catch(function (error)
            {
                console.error ('Fail to initialize '+this.__static.name);
                console.error (error);
            });
        }
    }

    update (datas)
    {
        let err;
        if (this.validators)
        {
            for (let field in datas)
            {
                if (this.validators[field])
                {
                    let validators = this.validators[field];
                    for (let validatorName in validators)
                    {
                        if (!validators[validatorName].call(this, datas.fields))
                        {
                            if (!err) err = {};
                            if (!err[field]) err[field] = [];
                            err[field].push(validatorName);
                        }
                    }
                }
            }
        }

        if (err) return Promise.reject(err);

        let updates = [];
        for (let field in datas)
        {
            if (!this.$store.hasOwnProperty(field)) continue;

            this.$store[field] = datas[field];
            updates.push(field);
        }

        this.save(...updates);

        return Promise.resolve(updates);
    }

    save (...vals)
    {
        let save = savesMap.get(this);
        if (!save)
        {
            save = {
                fields: vals
            ,   currentSave: Promise.delay(0).then(() =>
                {
                    for (let i = 0, l = save.fields.length; i<l; i++) {
                        this.$store.markModified(save.fields[i]);
                    }
                    save.fields = [];
                    this.$store.save()
                    .catch((e) => console.error (e))
                    .then(() => {
                        savesMap.delete(this);
                        if (save.fields.length)
                        {
                            this.save(...save.fields);
                        }
                    });
                })
            }
        }
        else
        {
            save.fields.concat(vals.filter((field) => save.fields.indexOf(field) === -1));
        }
    }

    toObject (graph = 'default', parents = [])
    {
        if (!graph || typeof graph !== 'object')
        {
            if (graph === 'all') graph = this.__static.graph.all;
            else graph = this.__static.graph.default;
        }

        let ret = {
            _id: helpers.makeDynamixId(this)
        };

        parents = parents.slice();
        parents.push(this);

        for (let i in graph)
        {
            if (!graph[i]) continue;
            let field = this.__static.schema[i];
            if (!field || field.private) continue;

            if (field.isRef)
            {
                if (field.isArray)
                {
                    let arr = this[i];
                    ret[i] = [];
                    for (let j = 0, l = arr.length; j<l; j++)
                    {
                        let val = arr[j];
                        if (parents.indexOf(val) > -1)
                        {
                            ret[i].push(helpers.makeDynamixId(val));
                        }
                        else
                        {
                            ret[i].push(val ? val.toObject(graph[i], parents):null);
                        }
                    }
                }
                else
                {
                    let val = this[i];
                    if (parents.indexOf(val) > -1)
                    {
                        ret[i] = helpers.makeDynamixId(val);
                    }
                    else
                    {
                        ret[i] = val ? val.toObject(graph[i], parents) : null;
                    }
                }
            }
            else
            {
                let val = this[i];
                if (val && typeof val === 'object')
                {
                    ret[i] = _.cloneDeep(val);
                }
                else
                {
                    ret[i] = val;
                }
            }
        }

        return ret;
    }

    destroy()
    {
        cache.remove(this);
        this.$store.destroy();
        super.destroy();
    }
}

function initializeRef (field, ref, context)
{
    let result = null;
    let isBroken = false;
    if (typeof ref === 'object')
    {
        if (ref.modelName && types.has(ref.modelName))
        {
            result = (new types.get(ref.modelName)).initialize();
        }
        else if (ref.id && field.type[ref.typeName])
        {
            result = field.type[ref.typeName].getOneOrCreate({_id: ref.id});
        }
    }
    if (!result && !field.isArray && typeof field.default !== 'undefined')
    {
        if (ref) isBroken = true;
        let res;
        if (typeof field.default === 'function')
        {
            let type = DynamixObject.getType(field.default.name);
            if (type) return type.create(data);

            res = field.default.call(context.$store);
        }
        else
        {
            res = field.default;
        }
        result = Promise.resolve(res)
        .then((res) => {
            switch (typeof res)
            {
                case 'object':
                    if (res instanceof DynamixObject) return res;
                    else if (Array.isArray(res))
                    {
                        let [type, data] = res;
                        type = DynamixObject.getType(type);
                        if (type) return type.create(data);
                    }
                break;
                case 'string':
                    let type = DynamixObject.getType(res);
                    if (type) return type.create({});
                default:
                    return null;
            }
        });
    }
    else if (!result && ref)
    {
        isBroken = true;
    }
    return {isBroken, result};
}

function normalizeSchema (schema)
{
    let mongooseSchema = {};
    for (let fieldName in schema)
    {
        const [normalizedField, mongooseField] = normalizeField(fieldName, schema[fieldName]);
        schema[fieldName] = normalizedField;
        mongooseSchema[fieldName] = mongooseField;
    }
}

function normalizeField (fieldName, field)
{
    let mongooseField = {};
    let normalizedField = {
        name: fieldName,
        type: null,
        isRef: false,
        isArray: false
    };

    let fieldValue;
    if (Array.isArray(field))
    {
        if (field.length === 1)
        {
            fieldValue = field[0];
            normalizedField.isArray = true;
        }
        else if (field.filter((item) => typeof item === 'function').length === field.length)
        {
            fieldValue = field;
        }
        else
        {
            throw new Error ('Invalid schema field : '+fieldName);
        }
    }
    else
    {
        fieldValue = field;
    }

    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue))
    {
        Object.assign(mongooseField, fieldValue);
        normalizeFieldType(fieldValue.type, normalizedField);
    }
    else
    {
        normalizeFieldType(fieldValue, normalizedField);
    }

    if (normalizedField.isRef)
    {
        mongooseField = {
            itemType: String
        ,   item: Object.assign(mongooseField, {type: Schema.Types.ObjectId, refPath: fieldName+'.itemType'})
        };
        if (normalizedField.isArray) mongooseField = [mongooseField];
    }
    else
    {
        mongooseField.type = normalizedField.isArray ? [normalizedField.type]:normalizedField.type;
    }

    return [normalizedField, mongooseField];
}

function normalizeFieldType (type, normalizedField)
{
    switch (typeof type)
    {
        case 'function':
            if (type.prototype instanceof DynamixObject)
            {
                normalizedField.isRef = true;
                normalizedField.type = {[type.name]: registerDependency(type, normalizedField)};
            }
            else
            {
                normalizedField.type = type;
            }
            break;
        case 'object':
            if (Array.isArray(type))
            {
                if (normalizedField.isArray === true)
                {
                    normalizedField.type = Array;
                }
                else
                {
                    normalizedField.isRef = true;
                    normalizedField.type = type.reduce((obj, type, index) => {
                        obj[typeName] = registerDependency(type, normalizedField, index);
                        return obj;
                    }, {});
                }
            }
            else
            {
                normalizedField.type = Schema.Types.Mixed;
            }
            break;
        default:
            normalizedField.type = Schema.Types.Mixed;
    }
}

function registerDependency (dependency, field, typeIndex = 0)
{
    switch (typeof dependency)
    {
        case 'string':
            let type = types.get(dependency);
            if (type) return type;

            let pendingTargets = pendingDependencies.get(dependency);
            if (!pendingTargets)
            {
                pendingTargets = [];
                pendingDependencies.set(dependency, pendingType);
            }
            pendingTargets.push({field, typeIndex});
            return dependency;
        case 'function':
            if (!types.has(dependency)) throw new Error ('Error '+dependency.name+ ' is not a registered type. Please call DynamixObject.register('+dependency.name+')');

            return dependency;
        default:
            throw new Error('dependency description is not valid');
    }
}

function resolveCircularDependencies (classObject)
{
    let pendingTargets = pendingDependencies.get(classObject.name);
    if (!pendingTargets) return;

    for (let i = 0, l = pendingTargets.length; i<l; i++)
    {
        let {field, typeIndex} = pendingTargets[i];
        field.type[typeIndex] = classObject;
    }
    pendingDependencies.delete(classObject.name);
}