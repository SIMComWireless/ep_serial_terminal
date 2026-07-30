# EP Serial Terminal

Browser-based Serial Terminal to test communications modules, using AT commands with intelligent macros, log and visual wizzards. It includes simulator for several modules. No install required.

## License

3-Clause BSD License, see LICENSE text file.

## Usage

## Online

You can use it online on this 2 sites:
 - [SIMCom EP Serial Terminal GitHub page](https://simcomwireless.github.io/ep_serial_terminal/)
 - [Eric Pernia EP Serial Terminal GitHub page](https://epernia.github.io/ep_serial_terminal/) - 

## Local

Download the code as .zip or clone the repository.
If you download as zip, unzip it.
Open `ep_serial_terminal.html`, you will see the "EP Serial Terminal":

![EP Serial Terminal](docs/img/ep_serial_terminal.png)

You can open up to 8 serial terminals connected to phisical serial ports (COM or tty) or simulated ports:

![EP Serial Terminal - Serial ports](docs/img/open_real_port_or_simulator.png)

As example we use a simulated port, with selected SIMCom A76XX module:

![SIMCom A76XX module](docs/img/simcom_a76xx.png)

It also exist a standalone version (all program in a single html file) named `ep_serial_terminal-standalone.html`.
You can share this version without any extra files, or use in a smartphone or tablet as example.
The only difference is that the other version is modularizated in several files, so is more easy to mantain the code.
