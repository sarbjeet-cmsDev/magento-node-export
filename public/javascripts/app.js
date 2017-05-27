var app = angular.module("magento", ["ui.router"]);

app.config(function($stateProvider, $urlRouterProvider) {

    $urlRouterProvider.otherwise('/');
    $stateProvider.state('login', {
            url: '/',
            templateUrl: 'login.html',
            controller:'loginCtrl'
        }).state('home', {
            url: '/home',
            templateUrl: 'export.html',
            controller:'mCtrl'
        });

});
app.controller('loginCtrl', function($scope, $http,$state) {
    $scope.user = 'admin';
    $scope.password = 'admin123';
    $scope.error = null;
    $scope.submit = function() {
        $http.post("/user/login", {
            username:this.user,
            password:this.password
        })
        .then(function (success) {
            if(success.status == 200)
            {
                $state.go("home");
            }
        }, function errorCallback(response) {
            $scope.error = response.data.error;
        });
    };
});


app.controller('mCtrl', function($scope, $http,$state) {

    $scope.eav_export = [];
    $scope.exporturl = null;
    $scope.error = null;
    $scope.limit = 200;
    $scope.offset = 0;
    $scope.loading = 0;
    $scope.fetch_by = 0;
    $scope.entity_to = 100;
    $scope.entity_from = 0;

    $scope.website = 0;

    $scope.store = 0;

    //logout
    $scope.logout = function(){
        $http({
            method: 'GET',
            url: '/user/logout'
        }).then(function (success){
            $state.go("login");
        });
    };

    //LOAD eav
    $http({
        method: 'GET',
        url: '/eav/get'
    }).then(function (success){
        if(success.data.errno)
             $scope.error = success.data.errno+":"+success.data.code+" Please check DB config file";
        else
            $scope.eav = success.data;
    }, function errorCallback(response) {
        $state.go("login");
     });


    //LOAD Websites
    $http({
        method: 'GET',
        url: '/eav/stores'
    }).then(function (success){
        if(success.data.errno)
             $scope.error = success.data.errno+":"+success.data.code+" Please check DB config file";
        else
            $scope.store = success.data;
    });

    //LOAD Stores
    $http({
        method: 'GET',
        url: '/eav/websites'
    }).then(function (success){
        if(success.data.errno)
             $scope.error = success.data.errno+":"+success.data.code+" Please check DB config file";
        else
            $scope.website = success.data;
    });




    //Collect selected eavs
    
    $scope.updateEavExport = function(eav){
        if(eav.checked){
            $scope.eav_export.push(eav);
            $scope.eav_export = _.uniq($scope.eav_export,'attribute_id');
        }else{
            $scope.eav_export = _.without($scope.eav_export, eav);
        }
    };

    $scope.export = function(){
        $scope.loading = 1;
        $http.post("/eav/export", {
            eav:$scope.eav_export,
            limit:this.limit,
            offset:this.offset,
            entity_from:this.entity_from,
            entity_to:this.entity_to,
            fetch_by:this.fetch_by,
            store:this._store,
            website:this._website,
        })
        .then(function (success) {
            $scope.exporturl = success.data.url;
            $scope.loading = 0;
        },function errorCallback(response){
            $state.go("login");
        });
    };
});





