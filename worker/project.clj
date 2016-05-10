(defproject patavi.worker "0.3"
  :url "http://patavi.com"
  :license {:name "The MIT License"
            :url "http://opensource.org/licenses/MIT"
            :distribution :repo}
  :description "Workers listen for tasks and dispatch them to RServe"
  :repositories {"sonatype-nexus-snapshots" "https://oss.sonatype.org/content/repositories/snapshots"
                 "sonatype-oss-public" "https://oss.sonatype.org/content/groups/public/"
                 "drugis" "http://drugis.org/mvn"}
  :plugins [[lein-environ "0.4.0"]]
  :dependencies [[org.clojure/clojure "1.5.1"]
                 [org.clojure/core.async "0.1.242.0-44b1e3-alpha"]
                 [org.clojure/tools.logging "0.2.6"]
                 [org.clojure/tools.cli "0.2.4"]
                 [environ "0.4.0"]
                 [cheshire "5.2.0"]
                 [log4j "1.2.17" :exclusions [javax.mail/mail
                                              javax.jms/jms
                                              com.sun.jdmk/jmxtools
                                              com.sun.jmx/jmxri]]
                 [com.google.guava/guava "15.0"]
                 [me.raynes/fs "1.4.5"]
                 [org.rosuda/REngine "1.7.1-20130821.152906-1"]
                 [com.novemberain/langohr "3.5.0"]
                 [crypto-random "1.2.0"]]
  :env {:rserve-logs "log/rserve.log"}
  :profiles {:uberjar {:aot :all}
             :dev {:dependencies [[org.clojure/tools.namespace "0.2.4"]]}}
  :main patavi.worker.main)
