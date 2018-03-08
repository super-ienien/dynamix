var Validator = require ('../validator');
var validators = require ('../validators');

function BooleanTypeValidator () {}

Validator.inherits (BooleanTypeValidator);

BooleanTypeValidator.prototype.rule = function (val)
{
	return typeof val === 'boolean';
}

BooleanTypeValidator.prototype.errorCode = 5;
BooleanTypeValidator.prototype.errorMessage = "Value is not a boolean";

validators.booleanType = module.exports = exports = new BooleanTypeValidator();