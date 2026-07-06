use crate::core::event::OutputAction;

use super::types::ActionSequence;
use super::Mapper;

impl Mapper {
    pub(super) fn text_sequence(value: &str) -> ActionSequence {
        let mut immediate = Vec::new();

        for ch in value.chars() {
            if let Some(mut actions) = Self::char_actions(ch) {
                immediate.append(&mut actions);
            } else {
                tracing::trace!(character = %ch, "text output character is not supported yet");
            }
        }

        ActionSequence {
            immediate,
            delayed: Vec::new(),
        }
    }

    fn char_actions(ch: char) -> Option<Vec<OutputAction>> {
        let (code, needs_shift) = match ch {
            'a'..='z' => (Self::alpha_code(ch), false),
            'A'..='Z' => (Self::alpha_code(ch.to_ascii_lowercase()), true),
            '1' => (2, false),
            '2' => (3, false),
            '3' => (4, false),
            '4' => (5, false),
            '5' => (6, false),
            '6' => (7, false),
            '7' => (8, false),
            '8' => (9, false),
            '9' => (10, false),
            '0' => (11, false),
            ' ' => (57, false),
            '-' => (12, false),
            '_' => (12, true),
            '=' => (13, false),
            '+' => (13, true),
            '[' => (26, false),
            '{' => (26, true),
            ']' => (27, false),
            '}' => (27, true),
            ';' => (39, false),
            ':' => (39, true),
            '\'' => (40, false),
            '"' => (40, true),
            '`' => (41, false),
            '~' => (41, true),
            '\\' => (43, false),
            '|' => (43, true),
            ',' => (51, false),
            '<' => (51, true),
            '.' => (52, false),
            '>' => (52, true),
            '/' => (53, false),
            '?' => (53, true),
            '!' => (2, true),
            '@' => (3, true),
            '#' => (4, true),
            '$' => (5, true),
            '%' => (6, true),
            '^' => (7, true),
            '&' => (8, true),
            '*' => (9, true),
            '(' => (10, true),
            ')' => (11, true),
            _ => return None,
        };

        let mut actions = Vec::new();

        if needs_shift {
            actions.push(OutputAction::Key {
                code: 42,
                pressed: true,
            });
        }

        actions.push(OutputAction::Key {
            code,
            pressed: true,
        });
        actions.push(OutputAction::Key {
            code,
            pressed: false,
        });

        if needs_shift {
            actions.push(OutputAction::Key {
                code: 42,
                pressed: false,
            });
        }

        Some(actions)
    }

    fn alpha_code(ch: char) -> u16 {
        match ch {
            'q' => 16,
            'w' => 17,
            'e' => 18,
            'r' => 19,
            't' => 20,
            'y' => 21,
            'u' => 22,
            'i' => 23,
            'o' => 24,
            'p' => 25,
            'a' => 30,
            's' => 31,
            'd' => 32,
            'f' => 33,
            'g' => 34,
            'h' => 35,
            'j' => 36,
            'k' => 37,
            'l' => 38,
            'z' => 44,
            'x' => 45,
            'c' => 46,
            'v' => 47,
            'b' => 48,
            'n' => 49,
            'm' => 50,
            _ => 0,
        }
    }
}
