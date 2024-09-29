/**
 * This panel is used with FF_1170 + FF_3873 in new interface,
 * but it's also used in old interface with FF_3873, but without FF_1170.
 * Only this component should get interface updates, other versions should be removed.
 */

import { observer } from "mobx-react";
import type { Instance } from "mobx-state-tree";
import type React from "react";
import { useCallback, useState } from "react";

import { IconBan, LsChevron } from "../../assets/icons";
import { Button } from "../../common/Button/Button";
import { Dropdown } from "../../common/Dropdown/Dropdown";
import type { CustomButton } from "../../stores/CustomButton";
import { Block, cn, Elem } from "../../utils/bem";
import { FF_REVIEWER_FLOW, isFF } from "../../utils/feature-flags";
import { isDefined } from "../../utils/utilities";
import { AcceptButton, ButtonTooltip, controlsInjector, RejectButton, SkipButton, UnskipButton } from "./buttons";

import "./Controls.scss";

type CustomControlProps = {
  button: Instance<typeof CustomButton>;
  disabled: boolean;
  onClick?: (name: string) => void;
};

/**
 * Custom action button component, rendering buttons from store.customButtons
 */
const CustomControl = observer(({ button, disabled, onClick }: CustomControlProps) => {
  const look = button.disabled || disabled ? "disabled" : button.look;
  const [waiting, setWaiting] = useState(false);
  const clickHandler = useCallback(async () => {
    if (!onClick) return;
    setWaiting(true);
    await onClick?.(button.name);
    setWaiting(false);
  }, []);
  return (
    <ButtonTooltip title={button.tooltip ?? ""}>
      <Button
        aria-label={button.ariaLabel}
        disabled={button.disabled || disabled || waiting}
        look={look}
        onClick={clickHandler}
        waiting={waiting}
      >
        {button.title}
      </Button>
    </ButtonTooltip>
  );
});

export const Controls = controlsInjector<{ annotation: MSTAnnotation }>(
  observer(({ store, history, annotation }) => {
    const isReview = store.hasInterface("review") || annotation.canBeReviewed;
    const isNotQuickView = store.hasInterface("topbar:prevnext");
    const historySelected = isDefined(store.annotationStore.selectedHistory);
    const { userGenerate, sentUserGenerate, versions, results, editable: annotationEditable } = annotation;
    const dropdownTrigger = cn("dropdown").elem("trigger").toClassName();
    const buttons = [];

    const [isInProgress, setIsInProgress] = useState(false);
    const disabled = !annotationEditable || store.isSubmitting || historySelected || isInProgress;
    const submitDisabled = store.hasInterface("annotations:deny-empty") && results.length === 0;

    const buttonHandler = useCallback(
      async (e: React.MouseEvent, callback: () => any, tooltipMessage: string) => {
        const { addedCommentThisSession, currentComment, commentFormSubmit } = store.commentStore;

        if (isInProgress) return;
        setIsInProgress(true);

        const selected = store.annotationStore?.selected;

        if (addedCommentThisSession) {
          selected?.submissionInProgress();
          callback();
        } else if (currentComment[annotation.id]?.trim()) {
          e.preventDefault();
          selected?.submissionInProgress();
          await commentFormSubmit();
          callback();
        } else {
          store.commentStore.setTooltipMessage(tooltipMessage);
        }
        setIsInProgress(false);
      },
      [
        store.rejectAnnotation,
        store.skipTask,
        store.commentStore.currentComment,
        store.commentStore.commentFormSubmit,
        store.commentStore.addedCommentThisSession,
        isInProgress,
      ],
    );

    // custom buttons replace all the internal buttons, but they can be reused if `name` is one of the internal buttons
    if (store.customButtons?.length) {
      for (const customButton of store.customButtons ?? []) {
        // @todo make a list of all internal buttons and use them here to mix custom buttons with internal ones
        if (customButton.name === "accept") {
          buttons.push(<AcceptButton disabled={disabled} history={history} store={store} />);
        } else {
          buttons.push(
            <CustomControl
              key={customButton.name}
              disabled={disabled}
              button={customButton}
              onClick={store.handleCustomButton}
            />,
          );
        }
      }
    } else if (isReview) {
      const onRejectWithComment = (e: React.MouseEvent, action: () => any) => {
        buttonHandler(e, action, "Please enter a comment before rejecting");
      };

      buttons.push(<RejectButton disabled={disabled} store={store} onRejectWithComment={onRejectWithComment} />);
      buttons.push(<AcceptButton disabled={disabled} history={history} store={store} />);
    } else if (annotation.skipped) {
      buttons.push(
        <Elem name="skipped-info" key="skipped">
          <IconBan color="#d00" /> Was skipped
        </Elem>,
      );
      buttons.push(<UnskipButton disabled={disabled} store={store} />);
    } else {
      if (store.hasInterface("skip")) {
        const onSkipWithComment = (e: React.MouseEvent, action: () => any) => {
          buttonHandler(e, action, "Please enter a comment before skipping");
        };

        buttons.push(<SkipButton disabled={disabled} store={store} onSkipWithComment={onSkipWithComment} />);
      }

      const isDisabled = disabled || submitDisabled;
      const look = isDisabled ? "disabled" : "primary";

      const useExitOption = !isDisabled && isNotQuickView;

      const SubmitOption = ({ isUpdate, onClickMethod }: { isUpdate: boolean; onClickMethod: () => any }) => {
        return (
          <Button
            name="submit-option"
            look="primary"
            onClick={async (event) => {
              event.preventDefault();

              const selected = store.annotationStore?.selected;

              selected?.submissionInProgress();

              if ("URLSearchParams" in window) {
                const searchParams = new URLSearchParams(window.location.search);

                searchParams.set("exitStream", "true");
                const newRelativePathQuery = `${window.location.pathname}?${searchParams.toString()}`;

                window.history.pushState(null, "", newRelativePathQuery);
              }

              await store.commentStore.commentFormSubmit();
              onClickMethod();
            }}
          >
            {`${isUpdate ? "Update" : "Submit"} and exit`}
          </Button>
        );
      };

      if (userGenerate || (store.explore && !userGenerate && store.hasInterface("submit"))) {
        const title = submitDisabled ? "Empty annotations denied in this project" : "Save results: [ Ctrl+Enter ]";

        buttons.push(
          <ButtonTooltip key="submit" title={title}>
            <Elem name="tooltip-wrapper">
              <Button
                aria-label="submit"
                name="submit"
                disabled={isDisabled}
                look={look}
                mod={{ has_icon: useExitOption, disabled: isDisabled }}
                onClick={async (event) => {
                  if ((event.target as HTMLButtonElement).classList.contains(dropdownTrigger)) return;
                  const selected = store.annotationStore?.selected;

                  selected?.submissionInProgress();
                  await store.commentStore.commentFormSubmit();
                  store.submitAnnotation();
                }}
                icon={
                  useExitOption ? (
                    <Dropdown.Trigger
                      alignment="top-right"
                      content={<SubmitOption onClickMethod={store.submitAnnotation} isUpdate={false} />}
                    >
                      <div>
                        <LsChevron />
                      </div>
                    </Dropdown.Trigger>
                  ) : undefined
                }
              >
                Submit
              </Button>
            </Elem>
          </ButtonTooltip>,
        );
      }

      if ((userGenerate && sentUserGenerate) || (!userGenerate && store.hasInterface("update"))) {
        const isUpdate = Boolean(isFF(FF_REVIEWER_FLOW) || sentUserGenerate || versions.result);
        // no changes were made over previously submitted version — no drafts, no pending changes
        const noChanges = isFF(FF_REVIEWER_FLOW) && !history.canUndo && !annotation.draftId;
        const isUpdateDisabled = isDisabled || noChanges;
        const button = (
          <ButtonTooltip key="update" title={noChanges ? "No changes were made" : "Update this task: [ Ctrl+Enter ]"}>
            <Button
              aria-label="submit"
              name="submit"
              disabled={isUpdateDisabled}
              look={look}
              mod={{ has_icon: useExitOption, disabled: isUpdateDisabled }}
              onClick={async (event) => {
                if ((event.target as HTMLButtonElement).classList.contains(dropdownTrigger)) return;
                const selected = store.annotationStore?.selected;

                selected?.submissionInProgress();
                await store.commentStore.commentFormSubmit();
                store.updateAnnotation();
              }}
              icon={
                useExitOption ? (
                  <Dropdown.Trigger
                    alignment="top-right"
                    content={<SubmitOption onClickMethod={store.updateAnnotation} isUpdate={isUpdate} />}
                  >
                    <div>
                      <LsChevron />
                    </div>
                  </Dropdown.Trigger>
                ) : undefined
              }
            >
              {isUpdate ? "Update" : "Submit"}
            </Button>
          </ButtonTooltip>
        );

        buttons.push(button);
      }
    }

    return <Block name="controls">{buttons}</Block>;
  }),
);
