var Validator = require ('../validator');
var validators = require ('../validators');

function StringTypeValidator () {}

Validator.inherits (StringTypeValidator);

StringTypeValidator.prototype.rule = function (val)
{
	return typeof val === 'string';
}

StringTypeValidator.prototype.errorCode = 2;
StringTypeValidator.prototype.errorMessage = "Value is not a string";

validators.stringType = module.exports = exports = new StringTypeValidator();