var Validator = require ('../validator');
var validators = require ('../validators');

function TypeValidator (type)
{
	this.vtype = type;
}

Validator.inherits (TypeValidator);

TypeValidator.prototype.rule = function (val)
{
	return val instanceof this.vtype;
}

TypeValidator.prototype.errorCode = 1;
TypeValidator.prototype.errorMessage = function ()
{
	return "Value is not an instance of : '"+this.vtype+"'";
}
validators.type = module.exports = exports = TypeValidator;