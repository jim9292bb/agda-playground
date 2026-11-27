module source where

data N : Set where
  z : N
  s : N -> N

postulate
  aVeryLongFunctionName : N -> N -> N

module M where
  r : N
  r = ?
