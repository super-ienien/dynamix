var Validator = require ('../validator');
var validators = require ('../validators');

function NumberTypeValidator () {}

Validator.inherits (NumberTypeValidator);

NumberTypeValidator.prototype.rule = function (val)
{
	return !isNaN(val);
}

NumberTypeValidator.prototype.errorCode = 3;
NumberTypeValidator.prototype.errorMessage = "Value is not a number";

validators.numberType = module.exports = exports = new NumberTypeValidator();