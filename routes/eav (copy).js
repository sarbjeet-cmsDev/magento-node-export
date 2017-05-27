var express = require('express');
var json2csv = require('json2csv');
var fs = require('fs');
var mysql = require('mysql');


var router = express.Router();

var config = JSON.parse(fs.readFileSync('./config/database.json', 'utf8'));

var mysqlModel = mysql.createPool(config);

router.use(function (req, res, next) {
	mysqlModel.getConnection(function(err) {
		if (err) res.json(err);
		else next();
	});
});

router.get('/stores', function(req, res, next) {
	mysqlModel.query("SELECT * FROM `core_store` WHERE `store_id` != '0'", 
	function(err, rows, fields)   
	{	
		res.json(rows);
	}); 
});

router.get('/websites', function(req, res, next) {
	mysqlModel.query("SELECT * FROM `core_website` WHERE `website_id` != '0'", 
	function(err, rows, fields)   
	{
		res.json(rows);
	}); 
});


router.get('/get', function(req, res, next) {
	mysqlModel.query("SELECT * FROM `eav_attribute` WHERE `frontend_label` IS NOT NULL AND `entity_type_id` = '4'", 
	function(err, rows, fields)   
	{
		res.json(rows);
	}); 
});


router.post('/export', function(req, res, next) {
	$export_eav = req.body.eav;

	$limit = req.body.limit;
	$entity_from = req.body.entity_from;
	$entity_to = req.body.entity_to;
	$fetch_by = req.body.fetch_by;
	$offset = req.body.offset;
	$store_id = req.body.store;

	var QUERY_END,QUERY_WHERE;

	if($fetch_by == 0){
		QUERY_END = " ORDER BY a.`entity_id` LIMIT "+$limit+" OFFSET "+$offset;
		QUERY_WHERE = " WHERE 1=1 ";
	}
	else{
		QUERY_WHERE = " WHERE a.`entity_id` >= "+$entity_from+" AND  a.`entity_id` <= "+$entity_to;
		QUERY_END = " ORDER BY a.`entity_id` ";
	}


	$e_sku = _.first(_.where($export_eav, {attribute_code: "sku"}));
	$export_eav = _.without($export_eav,$e_sku);


	//filter text value attribute eav
	$export_varchar = _.filter($export_eav,function(eav){ return _.contains(['text','datetime','varchar','decimal'],eav.backend_type); });


	//Extend eav with int values
	$export_varchar = _.extend($export_varchar,_.where($export_eav, {frontend_input: "boolean",backend_type:'int'}) );

	$export_varchar = _.extend($export_varchar,_.filter($export_eav,function(eav){ return _.contains(['visibility','tax_class_id','status'],eav.attribute_code); }));
	


	//async fn array
	$async_loop = new Array();

	//fetch product core data ie entity_id,sku
	$async_loop.push(function(callback){
		$q = "SELECT a.`entity_id`,a.`sku`,a.`type_id`,a.`has_options` FROM `catalog_product_entity` a"+QUERY_WHERE+QUERY_END;
		
		mysqlModel.query($q,function(err, rows, fields){
			callback(null,rows);
		});
	});


	//fetch Category ids & title
	$async_loop.push(function(callback){
		//tables object
		$q = "SELECT a.entity_id,group_concat(b.category_id) as category_ids , group_concat(c.value) as category_name FROM `catalog_product_entity` a LEFT JOIN `catalog_category_product` b ON a.entity_id = b.product_id LEFT JOIN `catalog_category_entity_varchar` c ON b.category_id = c.entity_id AND `attribute_id` = '41' AND store_id = 0 "+QUERY_WHERE+" GROUP BY a.entity_id "+QUERY_END;
		

		mysqlModel.query($q,function(err, rows, fields){
			callback(null,rows);
		});
	});

	//fetch product images
	$async_loop.push(function(callback){
		//tables object
		$q = "SELECT a.entity_id, group_concat(CONCAT('"+config.web_url+"media/catalog/product',b.value)) as media_gallery FROM `catalog_product_entity` a \
		LEFT JOIN `catalog_product_entity_media_gallery` b ON a.entity_id = b.entity_id \
		"+QUERY_WHERE+" GROUP BY a.entity_id "+QUERY_END;

		mysqlModel.query($q,function(err, rows, fields){
			callback(null,rows);
		});
	});


	//Export  eav boolean values
	$export_select = _.where($export_eav, {frontend_input: "select",source_model:null});
	_.each($export_select,function(eeav){
		$async_loop.push(function(callback){

			$q = "SELECT a.entity_id,c.value as `"+eeav.attribute_code+"` FROM `catalog_product_entity` a \
			LEFT JOIN `catalog_product_entity_"+eeav.backend_type+"` b ON a.entity_id = b.entity_id AND b.attribute_id = "+eeav.attribute_id+" AND b.store_id = 0 \
			LEFT JOIN `eav_attribute_option_value` c ON b.value = c.option_id AND c.store_id = 0 "+QUERY_WHERE+QUERY_END;
			mysqlModel.query($q,function(err, rows, fields){
				callback(null,rows);
			});
		})
	});


	//fetch text values eav data
	_.each($export_varchar,function(eeav){
		$async_loop.push(function(callback){

			$q = "SELECT a.entity_id,IF(c.value IS NULL,(IF(b.value IS NULL,'',b.value)),c.value) as `"+eeav.attribute_code+"` FROM `catalog_product_entity` a \
				  LEFT JOIN `catalog_product_entity_"+eeav.backend_type+"` b ON a.entity_id = b.entity_id AND b.attribute_id = "+eeav.attribute_id+" AND b.store_id = 0 \
				  LEFT JOIN `catalog_product_entity_"+eeav.backend_type+"` c ON a.entity_id = c.entity_id AND c.attribute_id = "+eeav.attribute_id+" AND c.store_id = "+$store_id
				  +QUERY_WHERE+QUERY_END;

			mysqlModel.query($q,function(err, rows, fields){
				callback(null,rows);
			});
		})
	});

	async.parallel($async_loop, function(err, results) {

		var list = _.groupBy(_.flatten(results) , 'entity_id');

		var f = _.map(list,function(e){
			var t = {};
			_.each(e,function(i){ _.extend(t,i); });
			return t;
		});

		//Write CSV file
		json2csv({ data: f, fields: _.keys(_.first(f))  }, function(err, csv) {
			if (err) console.log(err);

			fs.writeFile('./public/export/file.csv', csv, function(err) {
			 	if (err) throw err;
			  
			});

			res.json({msg:'file Saved',url:'/export/file.csv'});
		});
	});


});



module.exports = router;
