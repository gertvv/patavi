(defproject server-cached "0.2.5-1"
  :description "Patavi is a distributed system for exposing R as WAMP"
  :license {:name "The MIT License"
            :url "http://opensource.org/licenses/MIT"
            :distribution :repo}
  :url "http://patavi.com"
  :plugins [[lein-environ "0.4.0"]]
  :dependencies [[org.clojure/clojure "1.5.1"]
                 [org.clojure/java.jdbc "0.3.3"]
                 [postgresql "9.1-901-1.jdbc4"]
                 [patavi.server "0.2.5-1"]]
  :env {:broker-frontend-socket "ipc://frontend.ipc"
        :broker-updates-socket "ipc://updates.ipc"
        :broker-backend-socket "tcp://*:7740"
        :ws-origin-re "https?://.*"
        :ws-base-uri "http://api.patavi.com/"}
  :profiles {:uberjar {:aot :all}
             :dev {:dependencies [[criterium "0.4.2"]
                                  [org.clojure/tools.namespace "0.2.4"]
                                  [org.zeromq/jeromq "0.3.4"]]
                   :env {:patavi-cache-db-url "postgresql://localhost/addiscore?user=addiscore&password=develop"
                         :patavi-task-silence-timeout 20000
                         :patavi-task-global-timeout 300000}}
             :production {:dependencies [[org.zeromq/jzmq "3.0.1"]]
                          :jvm-opts ["-server" "-Djava.library.path=/usr/lib:/usr/local/lib"]}}
  :main patavi.server.server-cached)
