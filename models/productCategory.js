"use strict";

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    timestamps = require('mongoose-timestamp'),
    _ = require('lodash'),
    async = require('async'),
    Schema = mongoose.Schema,
    ObjectId = mongoose.Schema.Types.ObjectId;

var CategorySchema = new Schema({
    name: { type: String, default: 'All' },
    fullName: { type: String, default: 'All' },
    parent: { type: ObjectId, ref: 'productCategory', default: null },
    child: [{ type: ObjectId, default: null }],
    users: [{ type: ObjectId, ref: 'rh', default: null }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'hr' },
    editedBy: { type: Schema.Types.ObjectId, ref: 'hr' },

    nestingLevel: { type: Number, default: 0 },
    sequence: { type: Number, default: 0 },
    main: { type: Boolean, default: false },
    integrationId: { type: String, default: '' },
    taxesAccount: { type: ObjectId, ref: 'chartOfAccount', default: null },
    debitAccount: { type: ObjectId, ref: 'chartOfAccount', default: null },
    creditAccount: { type: ObjectId, ref: 'chartOfAccount', default: null },
    bankExpensesAccount: { type: ObjectId, ref: 'chartOfAccount', default: null },
    otherIncome: { type: ObjectId, ref: 'chartOfAccount', default: null },
    otherLoss: { type: ObjectId, ref: 'chartOfAccount', default: null }
});

CategorySchema.plugin(timestamps);

CategorySchema.statics.updateParentsCategory = function(newCategoryId, parentId, modifier, callback) {
    var ProductCategory = this;
    var id;
    var updateCriterior;

    if (modifier === 'add') {
        updateCriterior = { $addToSet: { child: newCategoryId } };
    } else {
        updateCriterior = { $pull: { child: newCategoryId } };
    }

    ProductCategory.findOneAndUpdate({ _id: parentId }, updateCriterior, function(err, result) {
        if (err)
            return callback(err);

        if (!result || !result.parent)
            return callback(null);

        id = result.parent;
        this.updateParentsCategory(newCategoryId, id, modifier, callback);
    });
};

CategorySchema.statics.updateNestingLevel = function(id, nestingLevel, callback) {
    var ProductCategory = this;

    ProductCategory.find({ parent: id }).exec(function(err, result) {
        var n = 0;
        if (result.length !== 0)
            return result.forEach(function(item) {
                n++;

                ProductCategory.findByIdAndUpdate(item._id, { nestingLevel: nestingLevel + 1 }, { new: true }, function(err, res) {
                    if (result.length === n)
                        ProductCategory.updateNestingLevel(res._id, res.nestingLevel + 1, callback);
                    else
                        ProductCategory.updateNestingLevel(res._id, res.nestingLevel + 1);

                });
            });

        if (callback)
            callback();
    });
};


CategorySchema.statics.updateSequence = function(model, sequenceField, start, end, parentDepartmentStart, parentDepartmentEnd, isCreate, isDelete, callback) {
    var query;
    var objFind = {};
    var objChange = {};
    var inc = -1;
    var c;

    if (parentDepartmentStart === parentDepartmentEnd) { // on one workflow

        if (!(isCreate || isDelete)) {

            if (start > end) {
                inc = 1;
                c = end;
                end = start;
                start = c;
            } else
                end -= 1;

            objChange = {};
            objFind = { parent: parentDepartmentStart };
            objFind[sequenceField] = { $gte: start, $lte: end };
            objChange[sequenceField] = inc;
            query = model.update(objFind, { $inc: objChange }, { multi: true });
            query.exec(function(err, res) {
                if (callback)
                    callback((inc === -1) ? end : start);

            });
        } else {
            if (isCreate) {
                query = model.count({ parent: parentDepartmentStart }).exec(function(err, res) {
                    if (callback)
                        callback(res);

                });
            }
            if (isDelete) {
                objChange = {};
                objFind = { parent: parentDepartmentStart };
                objFind[sequenceField] = { $gt: start };
                objChange[sequenceField] = -1;
                query = model.update(objFind, { $inc: objChange }, { multi: true });
                query.exec(function(err, res) {
                    if (callback)
                        callback(res);

                });
            }
        }
    } else { // nbetween workflow
        objChange = {};
        objFind = { parent: parentDepartmentStart };
        objFind[sequenceField] = { $gte: start };
        objChange[sequenceField] = -1;
        query = model.update(objFind, { $inc: objChange }, { multi: true });
        query.exec();
        objFind = { parent: parentDepartmentEnd };
        objFind[sequenceField] = { $gte: end };
        objChange[sequenceField] = 1;
        query = model.update(objFind, { $inc: objChange }, { multi: true });
        query.exec(function() {
            if (callback)
                callback(end);

        });

    }
};

CategorySchema.statics.updateFullName = function(id, cb) {
    var Model = this;
    var fullName;
    var parrentFullName;

    Model
        .findById(id)
        .populate('parent')
        .exec(function(err, category) {
            parrentFullName = category && category.parent ? category.parent.fullName : null;

            if (parrentFullName)
                fullName = parrentFullName + ' / ' + category.name;
            else
                fullName = category.name;


            if (!err)
                Model.findByIdAndUpdate(id, { $set: { fullName: fullName } }, { new: true }, cb);

        });
};

CategorySchema.statics.removeAllChild = function(id, callback) {
    var ProductCategory = this;
    var Product = MODEL('product').Schema;

    ProductCategory.find({
        $or: [
            { ancestors: { $elemMatch: { $eq: id } } },
            { _id: id }
        ]
    }, { _id: 1 }, function(err, result) {
        var ids;

        if (err)
            return callback(err);

        ids = _.pluck(result, '_id');

        function deleteCategories(parCb) {
            ProductCategory.remove({ _id: { $in: ids } }, function(err) {
                if (err)
                    return parCb(err);


                parCb(null);
            });
        }

        function deleteProducts(parCb) {
            Product.remove({ 'accounting.category._id': { $in: ids } }, function(err) {
                if (err)
                    return parCb(err);


                parCb(null);
            });
        }

        async
        .parallel([deleteCategories, deleteProducts], function(err) {
            if (err)
                return callback(err);


            callback(null);
        });
    });
};

exports.Schema = mongoose.model('productCategory', CategorySchema, 'ProductCategories');
exports.name = "productCategory";