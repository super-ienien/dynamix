var Validator = require ('../validator');
var validators = require ('../validators');

function RequiredValidator () {}

Validator.inherits (RequiredValidator);

RequiredValidator.prototype.rule = function (val)
{
	switch (typeof val)
	{
		case 'string':
			return val !== '';
		case 'undefined':
			return false;
		case 'object':
			return val !== null;
		default:
			return true;
	}
};

RequiredValidator.prototype.errorCode = 10;
RequiredValidator.prototype.errorMessage = 'Value is required';

validators.required = module.exports = exports = new RequiredValidator();