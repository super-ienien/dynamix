var Validator = require ('../validator');
var validators = require ('../validators');

function EnumValidator (e)
{
	this.enum = e;
}

Validator.inherits (EnumValidator);

EnumValidator.prototype.rule = function (val)
{
	return this.enum.indexOf(val) !== -1;
}

EnumValidator.prototype.errorCode = 11;
EnumValidator.prototype.errorMessage = function (val)
{
	"The value : '"+val+"' is not allowed";
}

EnumValidator.prototype.restricTo = ['string', 'number', 'integer'];

validators.enum = module.exports = exports = EnumValidator;