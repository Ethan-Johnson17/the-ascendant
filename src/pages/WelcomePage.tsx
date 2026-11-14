import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Crown, FlaskConical, Swords } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Ornament } from '../components/ui/Ornament.tsx';
import { duration, easeAscend } from '../styles/motion.ts';

const pillars = [
  { icon: BookOpen, title: 'Learn', text: 'Campaigns built from real curricula and credible sources, starting with the first cities of Mesopotamia.' },
  { icon: Swords, title: 'Prove', text: 'Quests and mandatory boss encounters test what you can actually explain and apply.' },
  { icon: Crown, title: 'Ascend', text: 'Your attributes begin at 1. Only demonstrated knowledge makes your character stronger.' },
];

export default function WelcomePage() {
  const { enterSample } = useGame();
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col justify-center py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.cinematic, ease: easeAscend }}
        className="text-center"
      >
        <p className="text-xs font-medium uppercase tracking-[0.4em] text-gold-500">An educational role-playing game</p>
        <h1 className="mt-5 font-display text-5xl font-semibold tracking-wide text-gold-200 sm:text-6xl">The Ascendant</h1>
        <p className="mx-auto mt-5 max-w-xl font-serif text-2xl italic leading-snug text-ash">
          Your real-world knowledge is the source of your character’s power.
        </p>
        <Ornament className="mt-8" />
      </motion.div>

      <motion.ul
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.4 } } }}
        className="mt-10 grid gap-3 sm:grid-cols-3"
      >
        {pillars.map((p) => (
          <motion.li
            key={p.title}
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: easeAscend } } }}
            className="rounded-panel border border-iron/80 bg-obsidian/80 p-5"
          >
            <p.icon className="size-5 text-gold-400" aria-hidden />
            <h2 className="mt-3 font-display text-lg font-semibold tracking-wide text-gold-200">{p.title}</h2>
            <p className="mt-1.5 text-sm text-ash">{p.text}</p>
          </motion.li>
        ))}
      </motion.ul>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: duration.slow }}
        className="mt-10 flex flex-col items-center gap-3"
      >
        <ButtonLink to="/sign-up" size="lg" className="w-full sm:w-auto sm:min-w-64">
          Create an account
        </ButtonLink>
        <ButtonLink to="/sign-in" variant="secondary" size="lg" className="w-full sm:w-auto sm:min-w-64">
          Sign in
        </ButtonLink>
        <Button
          variant="ghost"
          icon={<FlaskConical className="size-4 text-arcane" aria-hidden />}
          onClick={() => {
            enterSample();
            navigate('/');
          }}
        >
          Preview with a sample adventurer
        </Button>
      </motion.div>
    </div>
  );
}
