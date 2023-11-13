import { Component, JSXElement, Match, Show, Switch } from 'solid-js';
import { hookForDev } from '../../lib/devTools';
import { Button } from "@kobalte/core";

import styles from './Buttons.module.scss';

const ButtonPrimary: Component<{
  id?: string,
  onClick?: (e: MouseEvent) => void,
  children?: JSXElement,
  disabled?: boolean,
  type?: 'button' | 'submit' | 'reset' | undefined,
}> = (props) => {
  return (
    <Button.Root
      id={props.id}
      class={styles.primary}
      onClick={props.onClick}
      disabled={props.disabled}
      type={props.type}
    >
      <span>
        {props.children}
      </span>
    </Button.Root>
  )
}

export default hookForDev(ButtonPrimary);
