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
            [clojure.tools.logging :as log]))

(defn amqp-options []
  {:host (or (env :patavi-broker-host) "localhost")
   :username (or (env :patavi-broker-user) "guest")
   :password (or (env :patavi-broker-password) "guest")})

(def ^:const failed "failed")

(defn- send-update!
  [ch id content]
  (lb/publish ch
              "rpc_status"
              (str id ".status")
              (json/generate-string {:taskId id
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
  [ch handler metadata msg]
    (let [reply-to (:reply-to metadata)
          task-id (:correlation-id metadata)
          work (chan)
          updater (partial send-update! ch task-id)]
      (thread (>!! work (wrap-exception handler msg updater)))
      (thread
        (lb/publish ch "" reply-to (json/generate-string (<!! work)) { :content-type "application/json" :correlation-id task-id })
        (lb/ack ch (:delivery-tag metadata))
        (close! work))))

(defn- handle-incoming
  [handler]
  (fn [ch metadata ^bytes payload]
    (handle-request ch handler metadata (json/parse-string (String. payload)))))

(defn start
  [service handler]
  (let [conn (rmq/connect (amqp-options))
        ch (lch/open conn)]
    (lb/qos ch 1)
    (lq/declare ch service {:exclusive false :durable true :auto-delete false})
    (le/declare ch "rpc_status" "topic" { :durable false })
    (lc/subscribe ch service (handle-incoming handler) {:auto-ack false})))
