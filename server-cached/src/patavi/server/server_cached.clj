(ns patavi.server.server-cached
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [clojure.tools.cli :refer [cli]]
            [ring.middleware.reload :as reload]
            [ring.util.response :as response]
            [org.httpkit.server :refer :all]
            [compojure.core :refer :all]
            [compojure.handler :as handler]
            [compojure.route :as route]
            [clj-wamp.server :as wamp]
            [cheshire.core :as json]
            [environ.core :refer [env]]
            [clojure.java.jdbc :as jdbc]
            [patavi.server.http :as http]
            [patavi.server.handlers :as handlers]
            [patavi.server.middleware :refer :all]
            [patavi.server.service :as service :only [initialize]]))

(declare in-dev?)

(def db-url {:connection-uri (str "jdbc:" (env :cache-db-url))})

(defn cache-result [id result]
  (if (not (:error result))
    (jdbc/update! db-url :pataviTask {:result (json/generate-string result)} ["id = ?" id]))
  result)

(defn handle-service-with-cache [request data]
  (let [method (:method data)
        problem (json/parse-string (:problem data))
        from-patavi (fn [] (cache-result (:id data) (handlers/service-run-rpc method problem)))
        from-cache (fn [] (json/parse-string (:result data)))
        run (if (nil? (:result data)) from-patavi from-cache)]
    (wamp/with-channel-validation request channel handlers/origin-re
      (wamp/http-kit-handler channel
                             {:on-call {handlers/service-rpc-uri run}
                              :on-subscribe {handlers/service-status-uri true}
                              :on-publish {handlers/service-status-uri true}}))))

(defn println* [x] (println x) x)

(defn handle-with-cache [id req]
  (let [call (jdbc/query db-url ["select id, method, problem, result from pataviTask where id = ?" (Integer. id)])]
    (if (empty? call)
        { :status 404 :body "No such task" }
        (handle-service-with-cache req (first call)))))

(defn assemble-routes []
  (->
   (routes
    (GET "/ws" [:as req] (handlers/handle-service req))
    (OPTIONS "/ws" [] (http/options #{:options :get}))
    (GET "/ws/staged/:id" [id :as req] (handle-with-cache id req))
    (OPTIONS "/ws/staged/:id" [] (http/options #{:options :get}))
    (GET "/" [] (response/resource-response "index.html" {:root "public"}))
    (route/resources "/")
    (route/not-found "Page not found"))))

(def app
  (->
   (assemble-routes)
   (handler/api)
   (wrap-request-logger)
   (wrap-exception-handler)
   (wrap-response-logger)))

(defn -main
  [& args]
  (let [[options args banner]
        (cli args
             ["-h" "--help" "Show Help" :default false :flag true]
             ["-p" "--port" "Port to listen to" :default 3000 :parse-fn #(Integer. %)]
             ["-d" "--development" "Run server in development mode" :default false :flag true])]
    (defonce in-dev? (:development options))
    (when (:help options)
      (println banner)
      (System/exit 0))
    (let [handler (if in-dev? (reload/wrap-reload app) app)]
      (log/info "running server on:" (:port options))
      (service/initialize)
      (run-server handler {:port (:port options) :thread 256}))))
