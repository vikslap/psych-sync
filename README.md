# Bluff!

A multiplayer party game where players write fake answers to real trivia questions and try to fool their friends. The best bluffer wins!

## Features

- **Real-time multiplayer**: Join rooms and play with friends in real-time
- **Trivia-based gameplay**: Answer real trivia questions with convincing lies
- **Dark/Light mode**: Toggle between themes with system preference detection
- **Mobile responsive**: Optimized for both desktop and mobile devices
- **Custom decks**: Upload your own question sets via JSON

## Tech Stack

- **Frontend**: React 19 + Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (Realtime, Database)
- **Icons**: Lucide React
- **Animations**: Framer Motion

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Fill in your Supabase URL and anon key.

4. Start development server:

   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Environment Variables

- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Game Rules

1. **Host creates a room** and sets game parameters
2. **Players join** using the room code
3. **One player is randomly selected as the "bluffer"** each round
4. **The bluffer writes a convincing lie** to the trivia question
5. **Other players write the real answer**
6. **Everyone votes** on which answer they think is fake
7. **Points are awarded** for fooling others and correctly identifying lies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting:
   ```bash
   npm run lint
   npm run build
   ```
5. Submit a pull request

## License

MIT License - see LICENSE file for details
