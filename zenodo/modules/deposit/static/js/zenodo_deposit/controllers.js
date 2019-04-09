// This file is part of Zenodo.
// Copyright (C) 2017 CERN.
//
// Zenodo is free software; you can redistribute it
// and/or modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 2 of the
// License, or (at your option) any later version.
//
// Zenodo is distributed in the hope that it will be
// useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Zenodo; if not, write to the
// Free Software Foundation, Inc., 59 Temple Place, Suite 330, Boston,
// MA 02111-1307, USA.
//
// In applying this license, CERN does not
// waive the privileges and immunities granted to it by virtue of its status
// as an Intergovernmental Organization or submit itself to any jurisdiction.


// Overriding ui-select's controller to handle arrays
//
// Note: UI-Select by default doesn't play well while being inside an
// array. What happens is that if the array gets modified from the
// outside (eg. delete an array element), the changes are not picked up
// by UI-Select, and thus aren't refelcted on its internal model and
// view. This leads to inconsistent view state for the end user, eg.
// an item from the middle of a ui-select list gets removed using the
// 'X' button, but the view will still display it and remove the last
// item of the list.
//
// The remedy for this issue is to handle the update of ui-select's
// model manually, by overriding its controller.
function invenioDynamicSelectController($scope, $controller) {
  $controller('dynamicSelectController', {$scope: $scope});
  // If it is ui-select inside an array...
  if ($scope.modelArray) {
    $scope.$watchCollection('modelArray', function(newValue) {
      // If this is not the initial setting of the element...
      if (!angular.equals($scope.select_model, {})) {
        // Get the element's correct value from the array model
        var value = $scope.modelArray[$scope.arrayIndex][$scope.form.key.slice(-1)[0]];
        // Set ui-select's model to the correct value if needed
        if ($scope.insideModel !== value) {
          $scope.insideModel = value;
          var query = $scope.$eval(
            $scope.form.options.processQuery || 'query',
            { query: value }
          );
          $scope.populateTitleMap($scope.form, query);
          $scope.select_model.selected = $scope.find_in_titleMap(value);
        }
      }
    });
  }
}

invenioDynamicSelectController.$inject = [
  '$scope',
  '$controller',
];
/**
 * Retrieves DOI metainformation from DOI's provider
 * 
 * @param {angular.$http} $http Angular HTTP client module
 */
function DoiService($http, $q) {
  function setAlternativeIdentifier(doiObject, output) {
    function internalFormatter(ids) {
      return ids.map(function(id) { return { identifier: id }});
    }

    var outputIds = [];

    if (doiObject.ISSN)
      outputIds = outputIds.concat(internalFormatter(doiObject.ISSN));

    output.related_identifiers = outputIds;
  }

  function getLanguage(lang) {
    return $http.get('/api/language', { params: { q: lang } })
      .then(function(response) {
        return response.data.suggestions[0].code;
      })
      .catch(function() {
        return lang;
      })
  }

  function getAuthors(doiObject) {
    
  }

  /**
   * Search for DOI in dx.doi.org
   * 
   * @example
   * DoiService.getDoiFromDx('10.1016/j.jastp.2015.06.003')
   *   .then(doiObject => {
   *      console.log(doiObject);
   *    })
   * 
   * @param {string} doi DOI to search
   * @returns {Promise<any>}
   */
  this.getDoiFromDx = function(doi) {
    var reqObj = {
      method: 'GET',
      url: 'http://dx.doi.org/' + doi,
      headers: {
        'Accept': 'application/citeproc+json',
      }
    }

    var defer = $q.defer();

    $http(reqObj)
      .then(function(response) {
        console.log(response);
        // Reject promise when error occurred
        if (angular.isString(response.data) || response.status !== 200) {
          throw response;
        }

        var outputObject = {};
        outputObject.title = response.data.title;

        // Format output to well-known zenodo model
        outputObject.creators = response.data.author.map(function(author) {
          var name = author.literal || (author.family + ',' + author.given);
          var getAffiliation = function() {
            if (Array.isArray(author.getAffiliation) && author.affiliation.length !== 0) {
              return author.affiliation[0];
            }

            if (angular.isString(author.affiliation) && author.affiliation.length !== 0)
              return author.affiliation;

            return 'Unknown';
          }

          return { name: name, affiliation: getAffiliation(), orcid: author.orcid }
        });

        if (response.data.created) {
          var createdDatetime = response.data.created['date-time'];
          // TODO: Change this validator
          outputObject.publication_date = createdDatetime.substr(0, createdDatetime.indexOf('T'));
        }

        setAlternativeIdentifier(response.data, outputObject);

        return getLanguage(response.data.language)
          .then(function(language) {
            console.log(language);
            outputObject.language = language;
            return defer.resolve(outputObject)
          });
      })
      .catch(function(error) {
        if (error.status === 404)
          return defer.reject(new Error('DOI not found'));
        return defer.reject(new Error('Could not request for DOI'));
      });
    
    return defer.promise;
  }
}

// Inject dependencies into DoiService
DoiService.$inject = ['$http', '$q'];

function DoiSearcherController($scope, DoiService, debounce) {
  var self = this;
  this.isLoading = false;
  this.hasReqError = null;
  // Set debounce function to avoid overhead
  this.onChangeTrigger = onChangeTrigger

  /**
   * Dispatches DOI search and fill model results
   * @param {angular.$event} $event Internal angular event
   * @param {any} model Zenodo Model
   */
  function onChangeTrigger($event, model) {
    console.log("Previous", Object.assign({}, model));
    // Set component to loading state
    self.isLoading = true;
    self.hasReqError = null;

    var doi = model.doi;

    console.log($scope);

    if (!doi)
      return;
    
    DoiService.getDoiFromDx(doi)
      .then(function(doiFound) {
        // Merge found doi with model scope
        Object.assign(model, doiFound);

        console.log('After', model);

        $scope.formCtrl.$setDirty()
        $scope.formCtrl.$setSubmitted()
        $scope.$broadcast('schemaFormValidate');
      })
      .catch(function(err) {
        self.hasReqError = err.message;
      })
      .finally(function() {
        // Finalize component loading state
        self.isLoading = false;
      });
  }
}
// Inject angular dependencies
DoiSearcherController.$inject = ['$scope', 'DoiService', 'debounce'];

/**
 * Configure angular module to inject doisearcher component
 * 
 * @param {any} schemaFormDecoratorsProvider SchemaForm Provider
 */
function configModule(schemaFormDecoratorsProvider) {
  schemaFormDecoratorsProvider.defineAddOn(
    'bootstrapDecorator',
    'doisearcher',
    '/static/templates/zenodo_deposit/doisearcher.html'
  );
}
// Inject angular dependencies
configModule.$inject = ['schemaFormDecoratorsProvider'];


angular.module('schemaForm')
  .config(configModule)
  .controller('invenioDynamicSelectController', invenioDynamicSelectController)
  .controller('DoiSearcherController', DoiSearcherController)
  // Debounce function to avoid overhead
  .factory('debounce', ['$timeout','$q', function debounce($timeout, $q) {
    return function wrapDebounce(func, wait, immediate) {
      var timeout;
      // Create a deferred object that will be resolved when we need to
      // actually call the func
      var deferred = $q.defer();
      return function() {
        var context = this, args = arguments;
        var later = function() {
          timeout = null;
          if(!immediate) {
            deferred.resolve(func.apply(context, args));
            deferred = $q.defer();
          }
        };
        var callNow = immediate && !timeout;
        if ( timeout ) {
          $timeout.cancel(timeout);
        }
        timeout = $timeout(later, wait);
        if (callNow) {
          deferred.resolve(func.apply(context,args));
          deferred = $q.defer();
        }
        return deferred.promise;
      };
    };
  }])
  .service('DoiService', DoiService);
