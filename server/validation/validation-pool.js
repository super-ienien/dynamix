require ('./validators/');
const validatorsList = require ('./validators');
const requiredValidator = require('./validators/required-validator');

class ValidationPool
{
	constructor()
    {
        this.validators = new Map();
    }

    add (validator, args)
    {
        if (validator === 'required')
        {
            this.required = true;
            return;
        }

        if (typeof validator === 'string')
        {
            if (!validatorsList[validator]) throw new Error ('unknow validator : '+validator);
            if (typeof validatorsList[validator] === 'function')
            {
                validator = new validatorsList[validator](args);
            }
            else
            {
                validator = validatorsList[validator];
            }
        }
        this.validators.set(validator.type, validator);
    }

    validate (val, resultRef)
    {
        const result = typeof resultRef === 'object' ?  resultRef:{};

        result.invalid = {};
        result.valid =  {};
        result.isValid = false;
        result.isInvalid = false;

        try
        {
            for (let [type, validator] of this.validators)
            {
                validator.validate(val);
                result.valid[type] = true;
            }
        }
        catch (e)
        {
            result.invalid[e.type] = true;
            result.isInvalid = true;
        }

        if (!result.isInvalid) result.isValid = true;
        return resultRef ? result.isValid : result;
    }

    validateArray (arr, resultRef)
    {
        const result = typeof resultRef === 'object' ?  resultRef:{};

        result.invalid = {};
        result.valid =  {};
        result.isValid = false;
        result.isInvalid = false;


        try
        {
            if (arr === null)
            {
                if (this.required)
                {
                    requiredValidator.validate(val);
                    result.valid.required = true;
                }
            }
            else
            {
                for (let [type, validator] of this.validators)
                {
                    for (let i = 0, l = arr.length; i<l; i++)
                    {
                        validator.validate(arr[i]);
                    }
                    result.valid[type] = true;
                }
            }
        }
        catch (e)
        {
            result.invalid[e.type] = true;
            result.isInvalid = true;
        }

        if (!result.isInvalid) result.isValid = true;
        return resultRef ? result.isValid : result;
    }
}

module.exports = ValidationPool;