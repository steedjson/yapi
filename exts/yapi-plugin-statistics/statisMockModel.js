/**
 * Created by gxl.gao on 2017/10/24.
 */
// @ts-check
const yapi = require('yapi.js');
const baseModel = require('models/base.js');

class statisMockModel extends baseModel {
    getName() {
        return 'statis_mock';
    }

    getSchema() {
        return {
            interface_id: { type: Number, required: true },
            project_id: { type: Number, required: true },
            group_id: { type: Number, required: true },
            time: Number, //'时间戳'
            ip: String,
            date: String
        };
    }

    /**
     * @param {any} id
     */
    countByGroupId(id){
        return this.model.countDocuments({
            group_id: id
        })
    }

    /**
     * @param {any} data
     */
    save(data) {
        let m = new this.model(data);
        return m.save();
    }

    getTotalCount() {
        return this.model.countDocuments({});
    }

    /**
     * @param {any[]} timeInterval
     */
    async getDayCount(timeInterval) {
        let end = timeInterval[1];
        let start = timeInterval[0];
        /** @type {any[]} */
        let data = [];
        const cursor = this.model.aggregate([
            {
                $match: {
                    date: { $gt: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$date',  //$region is the column name in collection
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]).cursor({}).exec();
		await cursor.eachAsync((/** @type {any} */ doc) => data.push(doc));
		return data;

	}

    list() {
        return this.model.find({}).select('date').exec();
    }

    /**
     * @param {any} id
     * @param {any} data
     */
    up(id, data) {
        data.up_time = yapi.commons.time();
        return this.model.updateOne({
            _id: id
        }, data, { runValidators: true });
    }
}

module.exports = statisMockModel;