(ns patavi.worker.amqp
  (:require [langohr.core      :as rmq]
            [langohr.channel   :as lch]
            [langohr.queue     :as lq]
            [langohr.consumers :as lc]
            [langohr.basic     :as lb]
            [langohr.exchange  :as le]
            [cheshire.core :as json]
            [clojure.core.async :refer [thread >!! <!! close! chan]]
            [environ.core :refer [env]]
            [patavi.common.util :refer [insert]]
            [clojure.tools.logging :as log]))

(def ^:const host (env :patavi-broker-host))

(def ^:const failed "failed")

(defn- send-update!
  [ch service id content]
  (lb/publish ch
              "rpc_status"
              (str id ".status")
              (json/generate-string {:taskId id
                                     :service service
                                     :eventType "progress"
                                     :eventData content})
              { :content-type "application/json" }))

(defn- wrap-exception
  [fn & params]
  (try
    (apply fn params)
    (catch Exception e
      (do (log/error e)
          {:status failed
           :cause (.getMessage e)}))))

(defn- handle-request
  [ch service handler metadata msg]
    (let [reply-to (:reply-to metadata)
          task-id (:correlation-id metadata)
          work (chan)
          updater (partial send-update! ch service task-id)]
      (thread (>!! work (wrap-exception handler msg updater)))
      (thread
        (lb/publish ch "" reply-to (json/generate-string (<!! work)) { :content-type "application/json" :correlation-id task-id })
        (lb/ack ch (:delivery-tag metadata))
        (close! work))))

(defn- handle-incoming
  [service handler]
  (fn [ch metadata ^bytes payload]
    (handle-request ch service handler metadata (json/parse-string (String. payload)))))

(defn start
  [service handler]
  (let [conn (rmq/connect {:host host})
        ch (lch/open conn)]
    (lb/qos ch 1)
    (lq/declare ch service {:exclusive false :durable true :auto-delete false})
    (le/declare ch "rpc_status" "topic" { :durable false })
    (lc/subscribe ch service (handle-incoming service handler) {:auto-ack false})))
