import network
import time
from machine import Pin, time_pulse_us

try:
    import requests
except ImportError:
    try:
        import urequests as requests
    except ImportError:
        requests = None

API = "https://zydaroazpzoxydkdsvbl.supabase.co/functions/v1/smooth-action"
TOKEN = "Jly/cakBy@&y9L9UTV>D#I0KK0~Pf[?l"
INTERVALO_MS = 10_000
DISTANCIA_CHEIO_CM = 0.0
DISTANCIA_VAZIO_CM = 400.0

trig = Pin(5, Pin.OUT, value=0)
echo = Pin(18, Pin.IN)
led = Pin(15, Pin.OUT, value=0)
wifi = network.WLAN(network.STA_IF)


def conectar_wifi():
    if wifi.isconnected():
        return True

    print("Conectando ao Wokwi-GUEST...")
    wifi.active(False)
    wifi.active(True)
    wifi.connect("Wokwi-GUEST", "")
    inicio = time.ticks_ms()
    while not wifi.isconnected():
        if time.ticks_diff(time.ticks_ms(), inicio) >= 8000:
            print("Wi-Fi indisponível. Nova tentativa no próximo ciclo.")
            return False
        time.sleep_ms(100)

    print("Wi-Fi conectado. IP:", wifi.ifconfig()[0])
    return True


def medir():
    soma = 0.0
    validas = 0
    for _ in range(5):
        trig.off()
        time.sleep_us(2)
        trig.on()
        time.sleep_us(10)
        trig.off()

        pulso_us = time_pulse_us(echo, 1, 30_000)
        distancia = pulso_us * 0.0343 / 2
        if 2 <= distancia <= 450:
            soma += distancia
            validas += 1
        time.sleep_ms(60)

    if validas:
        return soma / validas
    return None


def calcular_nivel(distancia):
    faixa = DISTANCIA_VAZIO_CM - DISTANCIA_CHEIO_CM
    percentual = (DISTANCIA_VAZIO_CM - distancia) / faixa * 100
    return max(0.0, min(100.0, percentual))


def enviar(distancia, nivel):
    dados = {
        "device_id": "esp32-tanque-01",
        "quantity": "nivel_reservatorio",
        "value": round(nivel, 1),
        "unit": "%",
        "distance_cm": round(distancia, 1),
        "source": "sensor",
    }
    cabecalhos = {
        "Content-Type": "application/json",
        "x-device-token": TOKEN,
    }
    resposta = None
    try:
        resposta = requests.post(API, json=dados, headers=cabecalhos, timeout=8)
        print("HTTP", resposta.status_code)
        if not 200 <= resposta.status_code < 300:
            print(resposta.text)
    except OSError as erro:
        print("Falha no envio HTTPS:", erro)
    except TypeError as erro:
        print("Atualize o pacote requests para uma versão com timeout:", erro)
    finally:
        if resposta is not None:
            resposta.close()


def main():
    pode_enviar = requests is not None and TOKEN != "COLE_SEU_TOKEN_AQUI"
    if requests is None:
        print("Instale o pacote requests para habilitar o envio.")
    if TOKEN == "COLE_SEU_TOKEN_AQUI":
        print("Preencha TOKEN para habilitar o envio.")

    while True:
        inicio = time.ticks_ms()
        distancia = medir()
        if distancia is None:
            print("Leitura inválida: sem eco válido do sensor.")
        else:
            nivel = calcular_nivel(distancia)
            led.value(nivel < 20)
            print("Distância: {:.1f} cm | Nível: {:.1f} %".format(distancia, nivel))

        conectado = pode_enviar and conectar_wifi()
        if conectado and distancia is not None:
            enviar(distancia, nivel)

        decorrido = time.ticks_diff(time.ticks_ms(), inicio)
        time.sleep_ms(max(0, INTERVALO_MS - decorrido))


main()
