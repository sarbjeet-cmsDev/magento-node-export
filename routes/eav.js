var express = require('express');
var json2csv = require('json2csv');
var fs = require('fs');
var mysql = require('mysql');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var router = express.Router();




var mysqlModel;
router.use(function (req, res, next) {

	
	mysqlModel = mysql.createPool(config);
	mysqlModel.getConnection(function(err,connection) {

		if (err || !connection) res.json(err);
		else{req.connection = connection; next(); } 
	});
});



router.get('/stores', function(req, res, next) {
	mysqlModel.query("SELECT * FROM `core_store` WHERE `store_id` != '0'", 
	function(err, rows, fields)   
	{	
		req.connection.release(); 
		res.json(rows);
	}); 
});




router.get('/websites', function(req, res, next) {
	mysqlModel.query("SELECT * FROM `core_website` WHERE `website_id` != '0'", 
	function(err, rows, fields)   
	{
		req.connection.release(); 
		res.json(rows);
	}); 
});


router.get('/get', function(req, res, next) {
	mysqlModel.query("SELECT * FROM `eav_attribute` WHERE `frontend_label` IS NOT NULL AND `entity_type_id` = '4'", 
	function(err, rows, fields)   
	{
		req.connection.end(); 

		//add category attribute
		rows.push({
			attribute_id:'9999',
			attribute_code:'category',
			frontend_label:'Category',
			entity_type_id:'4',
		});

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
	$website_id = req.body.website;

	var QUERY_LIMIT,QUERY_WHERE;

	if($fetch_by == 0){
		QUERY_LIMIT = " LIMIT "+$limit+" OFFSET "+$offset;
		QUERY_WHERE = " AND 1=1 ";
	}
	else{
		QUERY_WHERE = " AND a.`entity_id` >= "+$entity_from+" AND  a.`entity_id` <= "+$entity_to;
		QUERY_LIMIT = "";
	}


	$e_sku = _.first(_.where($export_eav, {attribute_code: "sku"}));
	$export_eav = _.without($export_eav,$e_sku);


	//is export category
	$is_category_export = 0;
	if (_.findWhere($export_eav, {attribute_code:'category'}))
	{
		$export_eav = _.without($export_eav,{attribute_code:'category'});
		$is_category_export = 1;
	}
	//is media Export
	$is_media_export = 0;
	if (_.findWhere($export_eav, {attribute_code:'media_gallery'}))
	{
		$export_eav = _.without($export_eav,{attribute_code:'media_gallery'});
		$is_media_export = 1;
	}




	//filter text value attribute eav
	$export_varchar = _.filter($export_eav,function(eav){ return _.contains(['text','datetime','varchar','decimal'],eav.backend_type); });


	//Extend eav with int values
	$export_varchar = _.extend($export_varchar,_.where($export_eav, {frontend_input: "boolean",backend_type:'int'}) );

	$export_varchar = _.extend($export_varchar,_.filter($export_eav,function(eav){ return _.contains(['visibility','tax_class_id','status'],eav.attribute_code); }));
	




	//async fn array
	$async_loop = new Array();

	//fetch product core data ie entity_id,sku
	$async_loop.push(function(callback){
		$q = "SELECT z.`website_id`,a.`entity_id`,a.`sku`,a.`type_id`,a.`has_options` \
		FROM `catalog_product_website` z \
		LEFT JOIN `catalog_product_entity` a ON z.`product_id` = a.`entity_id`\
		WHERE z.`website_id` = "+$website_id
		+QUERY_WHERE+QUERY_LIMIT;

		mysqlModel.query($q,function(err, rows, fields){
			callback(null,rows);
		});
	});


	//fetch Category ids & title
	$async_loop.push(function(callback){
		//tables object
		if ($is_category_export)
		{
			$q = "SELECT a.entity_id,group_concat(b.category_id) as category_ids , group_concat(IF(d.value IS NULL,c.value,d.value)) as category_name \
			FROM `catalog_product_website` z \
			LEFT JOIN `catalog_product_entity` a ON z.`product_id` = a.`entity_id` \
			LEFT JOIN `catalog_category_product` b ON a.`entity_id` = b.product_id \
			LEFT JOIN `catalog_category_entity_varchar` c ON b.category_id = c.entity_id AND c.`attribute_id` = '41' AND c.`store_id` = 0 \
			LEFT JOIN `catalog_category_entity_varchar` d ON b.category_id = d.entity_id AND d.`attribute_id` = '41' AND d.`store_id` = "+$store_id
			+" WHERE z.`website_id` = "+$website_id
			+QUERY_WHERE+" GROUP BY a.entity_id "+QUERY_LIMIT;
			
			mysqlModel.query($q,function(err, rows, fields){
				callback(null,rows);
			});
		}
		else callback(null);
	});


	//fetch product images
	$async_loop.push(function(callback){
		if ($is_media_export)
		{
			$q = "SELECT a.entity_id, group_concat(CONCAT('"+config.web_url+"media/catalog/product',b.value)) as media_gallery \
			FROM `catalog_product_website` z \
			LEFT JOIN `catalog_product_entity` a ON z.`product_id` = a.`entity_id` \
			LEFT JOIN `catalog_product_entity_media_gallery` b ON a.entity_id = b.entity_id LEFT JOIN `catalog_product_entity_media_gallery_value` c ON c.value_id = b.value_id AND c.store_id ="+$store_id
			+" WHERE z.`website_id` = "+$website_id
			+QUERY_WHERE+" GROUP BY a.entity_id "+QUERY_LIMIT;

			mysqlModel.query($q,function(err, rows, fields){
				callback(null,rows);
			});
		}
		else callback(null);
	});	
	


	//Export  eav boolean values
	$export_select = _.where($export_eav, {frontend_input: "select",source_model:null});
	_.each($export_select,function(eeav){
		$async_loop.push(function(callback){

			$q = "SELECT a.entity_id,c.value as `"+eeav.attribute_code+"` \
			FROM `catalog_product_website` z\
			LEFT JOIN `catalog_product_entity` a ON z.`product_id` = a.`entity_id` \
			LEFT JOIN `catalog_product_entity_"+eeav.backend_type+"` b ON a.entity_id = b.entity_id AND b.attribute_id = "+eeav.attribute_id+" AND b.store_id = 0 \
			LEFT JOIN`eav_attribute_option_value` c ON b.value = c.option_id AND c.store_id = 0 "
			+" WHERE z.`website_id` = "+$website_id
			+QUERY_WHERE+QUERY_LIMIT;

			//console.log($q);

			mysqlModel.query($q,function(err, rows, fields){
				callback(null,rows);
			});
		})
	});


	//fetch text values eav data
	_.each($export_varchar,function(eeav){
		$async_loop.push(function(callback){

			$q = "SELECT a.entity_id,IF(c.value IS NULL,(IF(b.value IS NULL,'',b.value)),c.value) as `"+eeav.attribute_code+"` \
					FROM `catalog_product_website` z \
					LEFT JOIN `catalog_product_entity` a ON z.`product_id` = a.`entity_id` \
					LEFT JOIN `catalog_product_entity_"+eeav.backend_type+"` b ON a.entity_id = b.entity_id AND b.attribute_id = "+eeav.attribute_id+" AND b.store_id = 0 \
					LEFT JOIN `catalog_product_entity_"+eeav.backend_type+"` c ON a.entity_id = c.entity_id AND c.attribute_id = "+eeav.attribute_id+" AND c.store_id = "+$store_id
					+" WHERE z.`website_id` = "+$website_id
					+QUERY_WHERE+QUERY_LIMIT;

			mysqlModel.query($q,function(err, rows, fields){
				callback(null,rows);
			});
		})
	});

	async.parallel($async_loop, function(err, results) {

		req.connection.release(); 

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
