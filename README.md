# Empires
> Part of the Master in Language Technology at the University of Gothenburg
>
> **Course:** Dialogue Systems (LT2216)
>
> **Assignment:** Final project

*Empires* is the prototype of a round-based strategy game which the player can control through an interactive dialogue with a chatbot.
Hereby, the player can use natural language to express their moves while the game can respond, clarify or execute the proper action with variability.
The whole game is implemented in React, using the XState framework to control the game flow.
Voice is transcribed and generated through Microsoft Azure services and subsequently parsed with the help of Rasa.

## How to play
The game can be played on [https://empires.dominik-kuenkele.de](https://empires.dominik-kuenkele.de). The website needs permission to access the microphone.

The goal of the game is to defeat the bases of the three enemy (AI) empires. For this the player needs to move their own units strategically over the board towards the enemy bases and attack it. The enemy units try to prevent this.

Every round, the player can perform one action with each unit and train a new unit (if none is already trained). Each unit can either attack another unit or move to another tile on the board whereas every type of unit has its own strengths and weaknesses (following the rock, paper, scissors principle):

**Unit** | Move distance | Strong against | Weak against
---------|---------------|----------------|-------------
Archer   | 2             | Spearman       | Horseman
Spearman | 2             | Horseman       | Archer
Horseman | 3             | Archer         | Spearman

Depending on the attacked enemy, the unit deals double, normal or half the damage.
After the player chose an action for all units, the remaining empires are playing their rounds (currently random actions).

### Voice commands
The commands can be expressed in many different ways. The player can for instance use different names for the units (e.g. horseman, cavalry, ...), give information turn by turn, or correct themselves.

To move a unit, among others the following utterances are possible:
- Move the horseman to A4
- Move the knight - Where do you want to move it? - Move it to B3.
- Place it on C3. - Which unit? - Nevermind.

Apart from **moving** a unit, **attacking** a unit and **training** a unit, the player can also
- **skip** the turn,
- **ask how far a unit can move**,
- **ask what moves are possible with a unit** and optionally **approve** the game's proposal 
- and **ask what is the current turn**

The game will then **answer** the questions, **clarify** missing information or **execute** the requested action while **acknowledging** it.
In case the player doesn't say anything for some time, the game **proposes** a random action which the player can approve.
To decrease repetitiveness, the game chooses from several utterances for each option.

See [https://github.com/DominikKuenkele/MLT_Dialogue-Systems_empires-rasa/](https://github.com/DominikKuenkele/MLT_Dialogue-Systems_empires-rasa/) for more details on the commands.

## Architecture
The game is developed in *React* and mainly based on the [XState](https://github.com/statelyai/xstate) framework.
The speech recognition and generation is built on [Speechstate](https://github.com/vladmaraev/speechstate) by *vladmaraev*, which uses the *Microsoft Azure Speech Services* for Speech-to-text and Text-to-Speech.
After the utterances by the player are turned into text, they are passed to a Rasa server to extract *Intents* and *Entities*. Depending on these, the game transitions into different states, to for example request more information or execute the commands.



## How to run the game locally
To run the game locally, the following things need to be set up:

### Rasa server
(see [https://github.com/DominikKuenkele/MLT_Dialogue-Systems_empires-rasa/](https://github.com/DominikKuenkele/MLT_Dialogue-Systems_empires-rasa/))

### Microsoft Azure Speech services
Create a **speech service** in a **resource group** in the [Azure portal](https://portal.azure.com/).
Save the `KEY 1`.

### Local server
Install `yarn` and clone this repository.
Adapt the `homepage` in the `package.json` to e.g. `http://localhost/empires`.

Copy the `.env.example` to `.env` and add the following variable:
- Microsoft Azure Speech Service `KEY 1` as `REACT_APP_SUBSCRIPTION_KEY`
- URL for the Rasa server as `REACT_APP_RASA_SERVER`
- URL of the lexicon as `REACT_APP_TTS_LEXICON` (e.g. `http://localhost/empires/lexicon.xml`)

If you used another region in the Microsoft Azure Speech Service, this needs to be adapted in `TOKEN_ENDPOINT` and `REGION` constants in `src/machines/SpeecRecognitionMachine.ts`

Install all dependencies and run the local server with the following commands:
```bash
yarn install
yarn start
```