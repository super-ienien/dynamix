var Validator = require ('../validator')
,   validators = require ('../validators')
,   ObjectId = require ('mongoose').Schema.Types.ObjectId;

function ObjectIdTypeValidator () {}

Validator.inherits (ObjectIdTypeValidator);

ObjectIdTypeValidator.prototype.rule = function (val)
{
	return val instanceof ObjectId;
}

ObjectIdTypeValidator.prototype.errorCode = 7;
ObjectIdTypeValidator.prototype.errorMessage = "Value is not an ObjectId";

validators.objectIdType = module.exports = exports = new ObjectIdTypeValidator();