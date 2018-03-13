var Validator = require ('../validator');
var validators = require ('../validators');

function MaxValidator (max)
{
	this.max = max;
}

Validator.inherits (MaxValidator);

MaxValidator.prototype.rule = function (val)
{
	return val <= this.max;
}

MaxValidator.prototype.errorCode = 13;
MaxValidator.prototype.errorMessage = function (val) 
{
	return val +" is superior to : '"+this.max+"'";
}

MaxValidator.restricTo = ['number', 'integer'];

validators.max = module.exports = exports = MaxValidator;