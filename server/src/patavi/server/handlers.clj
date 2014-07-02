(ns patavi.server.handlers
  (:use patavi.server.util)
  (:require [clojure.tools.logging :as log]
            [clojure.string :only [replace split] :as s]
            [clojure.core.async :as async :refer [go-loop <! >! chan]]
            [clj-wamp.server :as wamp]
            [ring.util.response :as resp]
            [org.httpkit.server :as http-kit]
            [environ.core :refer [env]]
            [patavi.common.util :refer [dissoc-in]]
            [patavi.server.service :only [publish available? eta] :as service]))

(def base (env :ws-base-uri))
(def service-rpc-uri (str base "rpc#"))
(def service-status-uri (str base "status#"))
(def silence-timeout 
  (if (env :patavi-task-silence-timeout) 
    (Integer. (env :patavi-task-silence-timeout))
    (throw (RuntimeException. "PATAVI_TASK_SILENCE_TIMEOUT not set"))))
(def global-timeout 
  (if (env :patavi-task-global-timeout) 
    (Integer. (env :patavi-task-global-timeout))
    (throw (RuntimeException. "PATAVI_TASK_GLOBAL_TIMEOUT not set"))))

(defn- current-time []
  (System/currentTimeMillis))

(defn deref-dynamic 
  [ref last-update-time silence-timeout global-timeout timeout-val]
  (let [start-time (current-time)
        deadline (+ start-time global-timeout)]
    (loop [val (deref ref silence-timeout timeout-val)]
      (if (or (not (= val timeout-val)) 
              (> (current-time) deadline) 
              (> (current-time) (+ @last-update-time silence-timeout)))
        val
        (recur (deref ref silence-timeout timeout-val))))))

(defn dispatch-rpc
  [service data]
  (let [listeners [wamp/*call-sess-id*]
        {:keys [updates close results]} (service/publish service data)
        last-update-time (atom (current-time))]
    (try
      (go-loop [update (<! updates)]
        (when ((comp not nil?) update)
          (swap! last-update-time (fn [x] (current-time)))
          (wamp/emit-event! service-status-uri (:msg update) listeners)
          (recur (<! updates))))
      (deref-dynamic results
                     last-update-time
                     silence-timeout
                     global-timeout
                     {:error {:uri service-rpc-uri :message "this took way too long"}})
      (catch Exception e
        (do
          (log/error e)
          {:error {:uri service-rpc-uri
                   :message (.getMessage e)}})))))

(defn service-run-rpc [service data]
  (if (service/available? service)
    (dispatch-rpc service data)
    {:error {:uri service-rpc-uri
             :message (str "service " service " not available")}}))

(def origin-re (re-pattern (env :ws-origin-re)))

(defn handle-service
  "Returns a http-kit websocket handler with wamp subprotocol"
  [request]
  (wamp/with-channel-validation request channel origin-re
    (wamp/http-kit-handler channel
                           {:on-call {service-rpc-uri service-run-rpc}
                            :on-subscribe {service-status-uri true}
                            :on-publish {service-status-uri true}})))
