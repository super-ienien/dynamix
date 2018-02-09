function DBNotFoundError (collection, search)
{
    this.name = "DBNotFoundError";
    this.collection= typeof collection === 'function' ? collection.name:collection;
    this.search = search;
    this.message = "Item " + JSON.stringify(this.search) + " not found in " + this.collection;
}

DBNotFoundError.prototype = Object.create (Error.prototype);
DBNotFoundError.constructor = DBNotFoundError;

exports = module.exports = DBNotFoundError;